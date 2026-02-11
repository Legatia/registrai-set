// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {IMasterRegistry} from "./interfaces/IMasterRegistry.sol";
import {ScoreCalculator} from "./libraries/ScoreCalculator.sol";

contract MasterRegistry is IMasterRegistry, UUPSUpgradeable, OwnableUpgradeable {
    using ScoreCalculator for ChainReputation[];

    // ─── Constants ─────────────────────────────────────────────────────

    uint256 public constant MAX_IDENTITIES_PER_AGENT = 32;
    uint256 public constant MAX_CHAINS_PER_AGENT = 20;

    // ─── Storage ───────────────────────────────────────────────────────

    /// @notice hash(globalAgentId) => agentId
    mapping(bytes32 => bytes32) private _globalIdToAgent;

    /// @notice agentId => profile
    mapping(bytes32 => AgentProfile) private _agents;

    /// @notice agentId => global agent ID strings
    mapping(bytes32 => string[]) private _agentGlobalIds;

    /// @notice agentId => hash(globalAgentId) => exists (dedup)
    mapping(bytes32 => mapping(bytes32 => bool)) private _globalIdExists;

    /// @notice agentId => chainId => reputation
    mapping(bytes32 => mapping(uint256 => ChainReputation)) private _reputations;

    /// @notice agentId => chainIds array
    mapping(bytes32 => uint256[]) private _agentChains;

    /// @notice agentId => chainId => exists (dedup)
    mapping(bytes32 => mapping(uint256 => bool)) private _chainExists;

    /// @notice Authorized relayer addresses
    mapping(address => bool) private _relayers;

    /// @notice Per-relayer nonces for replay protection
    mapping(address => uint256) private _relayerNonces;

    /// @notice Total registered agents
    uint256 private _totalAgents;

    // ─── Modifiers ─────────────────────────────────────────────────────

    modifier onlyRelayerOrOwner() {
        if (!_relayers[msg.sender] && msg.sender != owner()) {
            revert NotRelayer();
        }
        _;
    }

    modifier onlyRelayer() {
        if (!_relayers[msg.sender]) {
            revert NotRelayer();
        }
        _;
    }

    // ─── Initializer ───────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_) external initializer {
        __Ownable_init(owner_);
    }

    // ─── Identity Functions ────────────────────────────────────────────

    /// @inheritdoc IMasterRegistry
    function registerAgent(string calldata globalAgentId, address ownerAddress)
        external
        onlyRelayerOrOwner
        returns (bytes32 agentId)
    {
        _validateGlobalAgentId(globalAgentId);

        bytes32 idHash = keccak256(bytes(globalAgentId));
        if (_globalIdToAgent[idHash] != bytes32(0)) {
            revert AgentAlreadyRegistered();
        }

        agentId = keccak256(abi.encode(globalAgentId, block.timestamp, _totalAgents));

        _agents[agentId] = AgentProfile({
            registeredAt: uint40(block.timestamp),
            chainCount: 0,
            exists: true,
            ownerAddress: ownerAddress
        });

        _globalIdToAgent[idHash] = agentId;
        _agentGlobalIds[agentId].push(globalAgentId);
        _globalIdExists[agentId][idHash] = true;

        _totalAgents++;

        emit AgentRegistered(agentId, globalAgentId, ownerAddress);
    }

    /// @inheritdoc IMasterRegistry
    function linkIdentity(
        string calldata globalAgentIdA,
        string calldata globalAgentIdB,
        address ownerAddressB,
        bytes calldata signature
    ) external {
        _validateGlobalAgentId(globalAgentIdB);

        // Resolve agentId from globalAgentIdA
        bytes32 idHashA = keccak256(bytes(globalAgentIdA));
        bytes32 agentId = _globalIdToAgent[idHashA];
        if (agentId == bytes32(0)) revert AgentNotFound();

        // Check globalAgentIdB is not already linked
        bytes32 idHashB = keccak256(bytes(globalAgentIdB));
        if (_globalIdToAgent[idHashB] != bytes32(0)) revert IdentityAlreadyLinked();

        // Check max identities
        if (_agentGlobalIds[agentId].length >= MAX_IDENTITIES_PER_AGENT) {
            revert MaxIdentitiesReached();
        }

        // Build EIP-191 signed message
        bytes32 messageHash = keccak256(
            abi.encode(
                "MasterRegistry:linkIdentity:v1",
                agentId,
                keccak256(bytes(globalAgentIdA)),
                keccak256(bytes(globalAgentIdB)),
                block.chainid
            )
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);

        // Recover signer and verify against ownerAddressB
        address signer = ECDSA.recover(ethSignedHash, signature);
        if (signer != ownerAddressB) revert InvalidSignature();

        // Link the identity
        _globalIdToAgent[idHashB] = agentId;
        _agentGlobalIds[agentId].push(globalAgentIdB);
        _globalIdExists[agentId][idHashB] = true;

        emit IdentityLinked(agentId, globalAgentIdB);
    }

    /// @inheritdoc IMasterRegistry
    function linkIdentitySameAddress(
        string calldata globalAgentIdA,
        string calldata globalAgentIdB,
        address ownerAddressB
    ) external onlyRelayerOrOwner {
        _validateGlobalAgentId(globalAgentIdB);

        // Resolve agentId from globalAgentIdA
        bytes32 idHashA = keccak256(bytes(globalAgentIdA));
        bytes32 agentId = _globalIdToAgent[idHashA];
        if (agentId == bytes32(0)) revert AgentNotFound();

        // Check globalAgentIdB is not already linked
        bytes32 idHashB = keccak256(bytes(globalAgentIdB));
        if (_globalIdToAgent[idHashB] != bytes32(0)) revert IdentityAlreadyLinked();

        // Check max identities
        if (_agentGlobalIds[agentId].length >= MAX_IDENTITIES_PER_AGENT) {
            revert MaxIdentitiesReached();
        }

        // Verify ownerAddressB matches the stored owner address
        if (ownerAddressB != _agents[agentId].ownerAddress) revert AddressMismatch();

        // Link the identity
        _globalIdToAgent[idHashB] = agentId;
        _agentGlobalIds[agentId].push(globalAgentIdB);
        _globalIdExists[agentId][idHashB] = true;

        emit IdentityLinked(agentId, globalAgentIdB);
    }

    /// @inheritdoc IMasterRegistry
    function resolveAgent(string calldata globalAgentId) external view returns (UnifiedAgentView memory view_) {
        bytes32 idHash = keccak256(bytes(globalAgentId));
        bytes32 agentId = _globalIdToAgent[idHash];
        if (agentId == bytes32(0)) revert AgentNotFound();

        AgentProfile storage profile = _agents[agentId];
        string[] storage globalIds = _agentGlobalIds[agentId];
        uint256[] storage chains = _agentChains[agentId];

        ChainReputation[] memory reps = new ChainReputation[](chains.length);
        for (uint256 i; i < chains.length;) {
            reps[i] = _reputations[agentId][chains[i]];
            unchecked { ++i; }
        }

        (int128 unifiedValue, uint8 unifiedDecimals, uint64 totalCount) = reps.computeWeightedAverage();

        view_ = UnifiedAgentView({
            agentId: agentId,
            globalAgentIds: globalIds,
            chainIds: chains,
            reputations: reps,
            unifiedValue: unifiedValue,
            unifiedValueDecimals: unifiedDecimals,
            totalFeedbackCount: totalCount,
            registeredAt: profile.registeredAt,
            ownerAddress: profile.ownerAddress
        });
    }

    /// @inheritdoc IMasterRegistry
    function getAgentId(string calldata globalAgentId) external view returns (bytes32) {
        bytes32 idHash = keccak256(bytes(globalAgentId));
        bytes32 agentId = _globalIdToAgent[idHash];
        if (agentId == bytes32(0)) revert AgentNotFound();
        return agentId;
    }

    /// @inheritdoc IMasterRegistry
    function getAgentIdentities(bytes32 agentId) external view returns (string[] memory) {
        if (!_agents[agentId].exists) revert AgentNotFound();
        return _agentGlobalIds[agentId];
    }

    // ─── Reputation Functions ──────────────────────────────────────────

    /// @inheritdoc IMasterRegistry
    function updateReputation(
        bytes32 agentId,
        uint256 chainId,
        ChainReputation calldata rep,
        bytes calldata signature
    ) external onlyRelayer {
        _updateReputationInternal(agentId, chainId, rep, signature);
    }

    /// @inheritdoc IMasterRegistry
    function batchUpdateReputation(
        bytes32[] calldata agentIds,
        uint256[] calldata chainIds,
        ChainReputation[] calldata reps,
        bytes[] calldata signatures
    ) external onlyRelayer {
        uint256 len = agentIds.length;
        require(len == chainIds.length && len == reps.length && len == signatures.length, "Length mismatch");

        for (uint256 i; i < len;) {
            _updateReputationInternal(agentIds[i], chainIds[i], reps[i], signatures[i]);
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IMasterRegistry
    function getUnifiedReputation(bytes32 agentId)
        external
        view
        returns (int128, uint8, uint64)
    {
        if (!_agents[agentId].exists) revert AgentNotFound();

        uint256[] storage chains = _agentChains[agentId];
        if (chains.length == 0) return (0, 0, 0);

        ChainReputation[] memory reps = new ChainReputation[](chains.length);
        for (uint256 i; i < chains.length;) {
            reps[i] = _reputations[agentId][chains[i]];
            unchecked { ++i; }
        }

        return reps.computeWeightedAverage();
    }

    /// @inheritdoc IMasterRegistry
    function getChainReputation(bytes32 agentId, uint256 chainId)
        external
        view
        returns (ChainReputation memory)
    {
        if (!_agents[agentId].exists) revert AgentNotFound();
        if (!_chainExists[agentId][chainId]) revert ChainNotFound();
        return _reputations[agentId][chainId];
    }

    // ─── Admin Functions ───────────────────────────────────────────────

    /// @inheritdoc IMasterRegistry
    function addRelayer(address relayer) external onlyOwner {
        if (relayer == address(0)) revert ZeroAddress();
        _relayers[relayer] = true;
        emit RelayerAdded(relayer);
    }

    /// @inheritdoc IMasterRegistry
    function removeRelayer(address relayer) external onlyOwner {
        if (relayer == address(0)) revert ZeroAddress();
        _relayers[relayer] = false;
        emit RelayerRemoved(relayer);
    }

    /// @inheritdoc IMasterRegistry
    function isRelayer(address addr) external view returns (bool) {
        return _relayers[addr];
    }

    /// @inheritdoc IMasterRegistry
    function totalAgents() external view returns (uint256) {
        return _totalAgents;
    }

    /// @notice Get the current nonce for a relayer
    function relayerNonce(address relayer) external view returns (uint256) {
        return _relayerNonces[relayer];
    }

    // ─── Internal ──────────────────────────────────────────────────────

    function _updateReputationInternal(
        bytes32 agentId,
        uint256 chainId,
        ChainReputation calldata rep,
        bytes calldata signature
    ) internal {
        if (!_agents[agentId].exists) revert AgentNotFound();

        // Verify relayer signature with nonce
        uint256 nonce = _relayerNonces[msg.sender];
        bytes32 messageHash = keccak256(
            abi.encode(agentId, chainId, rep.summaryValue, rep.summaryValueDecimals, rep.feedbackCount, nonce)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address signer = ECDSA.recover(ethSignedHash, signature);

        if (signer != msg.sender) revert InvalidSignature();

        _relayerNonces[msg.sender] = nonce + 1;

        // Track chain if new
        if (!_chainExists[agentId][chainId]) {
            if (_agentChains[agentId].length >= MAX_CHAINS_PER_AGENT) {
                revert MaxChainsReached();
            }
            _agentChains[agentId].push(chainId);
            _chainExists[agentId][chainId] = true;
            _agents[agentId].chainCount++;
        }

        _reputations[agentId][chainId] = rep;

        emit ReputationUpdated(agentId, chainId, rep.summaryValue, rep.feedbackCount);
    }

    /// @dev Validate global agent ID format: must start with "eip155:" and have exactly 3 colons total
    ///      Format: eip155:{chainId}:{registryAddr}:{agentId}
    function _validateGlobalAgentId(string calldata globalAgentId) internal pure {
        bytes memory b = bytes(globalAgentId);
        if (b.length < 16) revert InvalidGlobalAgentIdFormat(); // "eip155:1:0x...:1" minimum

        // Check "eip155:" prefix
        if (
            b[0] != 0x65 || // e
            b[1] != 0x69 || // i
            b[2] != 0x70 || // p
            b[3] != 0x31 || // 1
            b[4] != 0x35 || // 5
            b[5] != 0x35 || // 5
            b[6] != 0x3a    // :
        ) {
            revert InvalidGlobalAgentIdFormat();
        }

        // Count colons — must have exactly 3 total (after the prefix colon, need 2 more)
        uint256 colonCount = 1; // Already counted the prefix colon
        for (uint256 i = 7; i < b.length;) {
            if (b[i] == 0x3a) {
                colonCount++;
            }
            unchecked { ++i; }
        }
        if (colonCount != 3) revert InvalidGlobalAgentIdFormat();
    }

    // ─── UUPS ──────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}
}

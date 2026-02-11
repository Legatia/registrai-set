// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IMasterRegistry {
    // ─── Structs ───────────────────────────────────────────────────────

    /// @notice Per-chain reputation snapshot from ERC-8004 getSummary()
    struct ChainReputation {
        int128  summaryValue;          // from getSummary()
        uint8   summaryValueDecimals;  // decimal places
        uint64  feedbackCount;         // total feedback entries
        uint40  lastUpdated;           // timestamp of relayer update
        uint256 sourceChainId;         // chain this came from
    }

    /// @notice Agent profile metadata
    struct AgentProfile {
        uint40  registeredAt;
        uint16  chainCount;
        bool    exists;
        address ownerAddress;  // from L2 Identity Registry
    }

    /// @notice View struct returned by resolveAgent (not stored)
    struct UnifiedAgentView {
        bytes32 agentId;
        string[] globalAgentIds;         // 4-segment ERC-8004 identifiers
        uint256[] chainIds;
        ChainReputation[] reputations;
        int128  unifiedValue;            // cross-chain aggregate
        uint8   unifiedValueDecimals;
        uint64  totalFeedbackCount;
        uint40  registeredAt;
        address ownerAddress;
    }

    // ─── Events ────────────────────────────────────────────────────────

    event AgentRegistered(bytes32 indexed agentId, string globalAgentId, address indexed ownerAddress);
    event IdentityLinked(bytes32 indexed agentId, string globalAgentId);
    event ReputationUpdated(bytes32 indexed agentId, uint256 indexed chainId, int128 summaryValue, uint64 feedbackCount);
    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);

    // ─── Errors ────────────────────────────────────────────────────────

    error AgentAlreadyRegistered();
    error AgentNotFound();
    error IdentityAlreadyLinked();
    error InvalidGlobalAgentIdFormat();
    error InvalidSignature();
    error MaxIdentitiesReached();
    error MaxChainsReached();
    error NotRelayer();
    error InvalidNonce();
    error ZeroAddress();
    error ChainNotFound();
    error AddressMismatch();

    // ─── Identity Functions ────────────────────────────────────────────

    /// @notice Register a new agent from a global agent ID
    /// @param globalAgentId The 4-segment identifier (e.g., "eip155:8453:0x8004...:42")
    /// @param ownerAddress The agent's wallet address from L2 Identity Registry
    /// @return agentId The generated agent ID
    function registerAgent(string calldata globalAgentId, address ownerAddress) external returns (bytes32 agentId);

    /// @notice Link two EVM identities as the same agent via ECDSA proof
    /// @param globalAgentIdA An existing global agent ID already registered
    /// @param globalAgentIdB A new global agent ID to link
    /// @param ownerAddressB The owner address for globalAgentIdB
    /// @param signature EIP-191 signature from ownerAddressB
    function linkIdentity(
        string calldata globalAgentIdA,
        string calldata globalAgentIdB,
        address ownerAddressB,
        bytes calldata signature
    ) external;

    /// @notice Link a global agent ID that shares the same owner as an existing one
    /// @dev No signature needed — same owner address proves same agent
    /// @param globalAgentIdA An existing global agent ID already registered
    /// @param globalAgentIdB A new global agent ID with the same owner
    /// @param ownerAddressB The owner address to verify against stored owner
    function linkIdentitySameAddress(
        string calldata globalAgentIdA,
        string calldata globalAgentIdB,
        address ownerAddressB
    ) external;

    /// @notice Resolve full unified agent profile from a global agent ID
    /// @param globalAgentId Any global agent ID belonging to the agent
    /// @return view_ The unified agent view
    function resolveAgent(string calldata globalAgentId) external view returns (UnifiedAgentView memory view_);

    /// @notice Look up agentId from a global agent ID
    /// @param globalAgentId The 4-segment identifier
    /// @return agentId The agent's ID
    function getAgentId(string calldata globalAgentId) external view returns (bytes32 agentId);

    /// @notice Get all global agent IDs for an agent
    /// @param agentId The agent's ID
    /// @return globalAgentIds Array of 4-segment identifier strings
    function getAgentIdentities(bytes32 agentId) external view returns (string[] memory globalAgentIds);

    // ─── Reputation Functions ──────────────────────────────────────────

    /// @notice Update reputation for an agent on a specific chain
    /// @param agentId The agent's ID
    /// @param chainId The chain ID
    /// @param rep The reputation snapshot
    /// @param signature Relayer signature over the update data
    function updateReputation(
        bytes32 agentId,
        uint256 chainId,
        ChainReputation calldata rep,
        bytes calldata signature
    ) external;

    /// @notice Batch update reputation for multiple agents
    /// @param agentIds Array of agent IDs
    /// @param chainIds Array of chain IDs
    /// @param reps Array of reputation snapshots
    /// @param signatures Array of relayer signatures
    function batchUpdateReputation(
        bytes32[] calldata agentIds,
        uint256[] calldata chainIds,
        ChainReputation[] calldata reps,
        bytes[] calldata signatures
    ) external;

    /// @notice Get the unified reputation across all chains for an agent
    /// @param agentId The agent's ID
    /// @return unifiedValue Weighted average value
    /// @return decimals Decimal places for the value
    /// @return totalFeedbackCount Total feedback entries across chains
    function getUnifiedReputation(bytes32 agentId)
        external
        view
        returns (int128 unifiedValue, uint8 decimals, uint64 totalFeedbackCount);

    /// @notice Get reputation for an agent on a specific chain
    /// @param agentId The agent's ID
    /// @param chainId The chain ID
    /// @return rep The chain reputation snapshot
    function getChainReputation(bytes32 agentId, uint256 chainId) external view returns (ChainReputation memory rep);

    // ─── Admin Functions ───────────────────────────────────────────────

    /// @notice Add a relayer address
    /// @param relayer The address to authorize as a relayer
    function addRelayer(address relayer) external;

    /// @notice Remove a relayer address
    /// @param relayer The address to deauthorize
    function removeRelayer(address relayer) external;

    /// @notice Check if an address is an authorized relayer
    /// @param addr The address to check
    /// @return isRelayer Whether the address is a relayer
    function isRelayer(address addr) external view returns (bool isRelayer);

    /// @notice Get the total number of registered agents
    /// @return count The total agent count
    function totalAgents() external view returns (uint256 count);
}

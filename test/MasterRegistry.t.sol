// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MasterRegistry} from "../src/MasterRegistry.sol";
import {IMasterRegistry} from "../src/interfaces/IMasterRegistry.sol";
import {SigUtils} from "./helpers/SigUtils.sol";

contract MasterRegistryTest is Test {
    MasterRegistry public registry;
    MasterRegistry public impl;

    address public owner;
    uint256 public relayerKey;
    address public relayer;
    uint256 public agentKeyA;
    address public agentAddrA;
    uint256 public agentKeyB;
    address public agentAddrB;

    // 4-segment global agent IDs: eip155:{chainId}:{registryAddr}:{agentId}
    string constant IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

    string public globalIdBase;  // Base chain
    string public globalIdArb;   // Arbitrum chain

    function setUp() public {
        owner = address(this);

        // Generate deterministic keys
        relayerKey = 0xA11CE;
        relayer = vm.addr(relayerKey);

        agentKeyA = 0xB0B;
        agentAddrA = vm.addr(agentKeyA);

        agentKeyB = 0xCAFE;
        agentAddrB = vm.addr(agentKeyB);

        // Build 4-segment global agent IDs
        globalIdBase = string.concat("eip155:8453:", IDENTITY_REGISTRY, ":1");
        globalIdArb = string.concat("eip155:42161:", IDENTITY_REGISTRY, ":2");

        // Deploy
        impl = new MasterRegistry();
        bytes memory initData = abi.encodeCall(MasterRegistry.initialize, (owner));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        registry = MasterRegistry(address(proxy));

        // Add relayer
        registry.addRelayer(relayer);
    }

    // ─── Registration Tests ────────────────────────────────────────────

    function test_registerAgent() public {
        vm.prank(relayer);
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);

        assertNotEq(agentId, bytes32(0));
        assertEq(registry.totalAgents(), 1);
        assertEq(registry.getAgentId(globalIdBase), agentId);

        string[] memory ids = registry.getAgentIdentities(agentId);
        assertEq(ids.length, 1);
        assertEq(ids[0], globalIdBase);
    }

    function test_registerAgent_ownerCanRegister() public {
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);
        assertNotEq(agentId, bytes32(0));
    }

    function test_registerAgent_revertDuplicate() public {
        registry.registerAgent(globalIdBase, agentAddrA);
        vm.expectRevert(IMasterRegistry.AgentAlreadyRegistered.selector);
        registry.registerAgent(globalIdBase, agentAddrA);
    }

    function test_registerAgent_revertUnauthorized() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(IMasterRegistry.NotRelayer.selector);
        registry.registerAgent(globalIdBase, agentAddrA);
    }

    function test_registerAgent_revertInvalidFormat() public {
        vm.expectRevert(IMasterRegistry.InvalidGlobalAgentIdFormat.selector);
        registry.registerAgent("invalid", agentAddrA);
    }

    function test_registerAgent_revertNoPrefixFormat() public {
        vm.expectRevert(IMasterRegistry.InvalidGlobalAgentIdFormat.selector);
        registry.registerAgent("bitcoin:1:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:1", agentAddrA);
    }

    function test_registerAgent_revert3SegmentFormat() public {
        // 3-segment (old CAIP-10) format should be rejected — requires 4 segments
        vm.expectRevert(IMasterRegistry.InvalidGlobalAgentIdFormat.selector);
        registry.registerAgent("eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", agentAddrA);
    }

    function test_registerAgent_revert5SegmentFormat() public {
        // 5-segment format should also be rejected
        vm.expectRevert(IMasterRegistry.InvalidGlobalAgentIdFormat.selector);
        registry.registerAgent("eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:1:extra", agentAddrA);
    }

    // ─── Identity Linking Tests ────────────────────────────────────────

    function test_linkIdentity() public {
        // Register agent on Base
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);

        // Sign link message from agentAddrB (owner of the Arbitrum identity)
        bytes32 digest = SigUtils.getLinkMessageHash(
            agentId,
            globalIdBase,
            globalIdArb,
            block.chainid
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKeyB, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Link with ownerAddressB
        registry.linkIdentity(globalIdBase, globalIdArb, agentAddrB, sig);

        // Verify
        assertEq(registry.getAgentId(globalIdArb), agentId);
        string[] memory ids = registry.getAgentIdentities(agentId);
        assertEq(ids.length, 2);
    }

    function test_linkIdentity_revertAgentNotFound() public {
        bytes32 fakeAgentId = bytes32(uint256(1));
        bytes32 digest = SigUtils.getLinkMessageHash(
            fakeAgentId,
            globalIdBase,
            globalIdArb,
            block.chainid
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKeyB, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.expectRevert(IMasterRegistry.AgentNotFound.selector);
        registry.linkIdentity(globalIdBase, globalIdArb, agentAddrB, sig);
    }

    function test_linkIdentity_revertAlreadyLinked() public {
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);

        bytes32 digest = SigUtils.getLinkMessageHash(agentId, globalIdBase, globalIdArb, block.chainid);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKeyB, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        registry.linkIdentity(globalIdBase, globalIdArb, agentAddrB, sig);

        // Try to link again
        vm.expectRevert(IMasterRegistry.IdentityAlreadyLinked.selector);
        registry.linkIdentity(globalIdBase, globalIdArb, agentAddrB, sig);
    }

    function test_linkIdentity_revertInvalidSignature() public {
        registry.registerAgent(globalIdBase, agentAddrA);

        bytes32 agentId = registry.getAgentId(globalIdBase);

        // Sign with wrong key (agentKeyA instead of agentKeyB)
        bytes32 digest = SigUtils.getLinkMessageHash(agentId, globalIdBase, globalIdArb, block.chainid);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKeyA, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.expectRevert(IMasterRegistry.InvalidSignature.selector);
        registry.linkIdentity(globalIdBase, globalIdArb, agentAddrB, sig);
    }

    // ─── Same-Address Auto-Link Tests ────────────────────────────────

    function test_linkIdentitySameAddress() public {
        // Same owner (agentAddrA) on Base and Arbitrum
        string memory baseId = string.concat("eip155:8453:", IDENTITY_REGISTRY, ":10");
        string memory arbId = string.concat("eip155:42161:", IDENTITY_REGISTRY, ":10");

        bytes32 agentId = registry.registerAgent(baseId, agentAddrA);

        // Relayer auto-links — ownerAddressB must match stored ownerAddress
        vm.prank(relayer);
        registry.linkIdentitySameAddress(baseId, arbId, agentAddrA);

        // Both resolve to same agent
        assertEq(registry.getAgentId(arbId), agentId);
        string[] memory ids = registry.getAgentIdentities(agentId);
        assertEq(ids.length, 2);
    }

    function test_linkIdentitySameAddress_ownerCanCall() public {
        string memory baseId = string.concat("eip155:8453:", IDENTITY_REGISTRY, ":11");
        string memory optId = string.concat("eip155:10:", IDENTITY_REGISTRY, ":11");

        bytes32 agentId = registry.registerAgent(baseId, agentAddrA);
        registry.linkIdentitySameAddress(baseId, optId, agentAddrA);

        assertEq(registry.getAgentId(optId), agentId);
    }

    function test_linkIdentitySameAddress_multipleChains() public {
        string memory baseId = string.concat("eip155:8453:", IDENTITY_REGISTRY, ":12");
        string memory arbId = string.concat("eip155:42161:", IDENTITY_REGISTRY, ":12");
        string memory optId = string.concat("eip155:10:", IDENTITY_REGISTRY, ":12");
        string memory lineaId = string.concat("eip155:59144:", IDENTITY_REGISTRY, ":12");

        bytes32 agentId = registry.registerAgent(baseId, agentAddrA);

        vm.startPrank(relayer);
        registry.linkIdentitySameAddress(baseId, arbId, agentAddrA);
        registry.linkIdentitySameAddress(baseId, optId, agentAddrA);
        registry.linkIdentitySameAddress(baseId, lineaId, agentAddrA);
        vm.stopPrank();

        string[] memory ids = registry.getAgentIdentities(agentId);
        assertEq(ids.length, 4);
    }

    function test_linkIdentitySameAddress_revertAddressMismatch() public {
        // Register with agentAddrA as owner
        string memory baseId = string.concat("eip155:8453:", IDENTITY_REGISTRY, ":13");
        registry.registerAgent(baseId, agentAddrA);

        // Try to link with different owner address — should fail
        string memory arbId = string.concat("eip155:42161:", IDENTITY_REGISTRY, ":13");

        vm.prank(relayer);
        vm.expectRevert(IMasterRegistry.AddressMismatch.selector);
        registry.linkIdentitySameAddress(baseId, arbId, agentAddrB);
    }

    function test_linkIdentitySameAddress_revertNotRelayer() public {
        string memory baseId = string.concat("eip155:8453:", IDENTITY_REGISTRY, ":14");
        string memory arbId = string.concat("eip155:42161:", IDENTITY_REGISTRY, ":14");
        registry.registerAgent(baseId, agentAddrA);

        vm.prank(address(0xDEAD));
        vm.expectRevert(IMasterRegistry.NotRelayer.selector);
        registry.linkIdentitySameAddress(baseId, arbId, agentAddrA);
    }

    function test_linkIdentitySameAddress_revertAlreadyLinked() public {
        string memory baseId = string.concat("eip155:8453:", IDENTITY_REGISTRY, ":15");
        string memory arbId = string.concat("eip155:42161:", IDENTITY_REGISTRY, ":15");

        registry.registerAgent(baseId, agentAddrA);

        vm.prank(relayer);
        registry.linkIdentitySameAddress(baseId, arbId, agentAddrA);

        vm.prank(relayer);
        vm.expectRevert(IMasterRegistry.IdentityAlreadyLinked.selector);
        registry.linkIdentitySameAddress(baseId, arbId, agentAddrA);
    }

    // ─── Reputation Tests ──────────────────────────────────────────────

    function test_updateReputation() public {
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);

        IMasterRegistry.ChainReputation memory rep = IMasterRegistry.ChainReputation({
            summaryValue: 4200,   // e.g. 4.200 with 3 decimals
            summaryValueDecimals: 3,
            feedbackCount: 100,
            lastUpdated: uint40(block.timestamp),
            sourceChainId: 8453
        });

        uint256 nonce = registry.relayerNonce(relayer);
        bytes32 digest = SigUtils.getReputationMessageHash(
            agentId, 8453, rep.summaryValue, rep.summaryValueDecimals, rep.feedbackCount, nonce
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(relayer);
        registry.updateReputation(agentId, 8453, rep, sig);

        IMasterRegistry.ChainReputation memory stored = registry.getChainReputation(agentId, 8453);
        assertEq(stored.summaryValue, 4200);
        assertEq(stored.summaryValueDecimals, 3);
        assertEq(stored.feedbackCount, 100);
    }

    function test_updateReputation_revertNotRelayer() public {
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);

        IMasterRegistry.ChainReputation memory rep = IMasterRegistry.ChainReputation({
            summaryValue: 4200,
            summaryValueDecimals: 3,
            feedbackCount: 100,
            lastUpdated: uint40(block.timestamp),
            sourceChainId: 8453
        });

        vm.prank(address(0xDEAD));
        vm.expectRevert(IMasterRegistry.NotRelayer.selector);
        registry.updateReputation(agentId, 8453, rep, "");
    }

    function test_updateReputation_negativeValue() public {
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);

        // Negative reputation value (e.g. -1.5 with 1 decimal)
        IMasterRegistry.ChainReputation memory rep = IMasterRegistry.ChainReputation({
            summaryValue: -15,
            summaryValueDecimals: 1,
            feedbackCount: 50,
            lastUpdated: uint40(block.timestamp),
            sourceChainId: 8453
        });

        uint256 nonce = registry.relayerNonce(relayer);
        bytes32 digest = SigUtils.getReputationMessageHash(
            agentId, 8453, rep.summaryValue, rep.summaryValueDecimals, rep.feedbackCount, nonce
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(relayer);
        registry.updateReputation(agentId, 8453, rep, sig);

        IMasterRegistry.ChainReputation memory stored = registry.getChainReputation(agentId, 8453);
        assertEq(stored.summaryValue, -15);
    }

    function test_updateReputation_nonceIncrement() public {
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);

        assertEq(registry.relayerNonce(relayer), 0);

        // First update
        _doReputationUpdate(agentId, 8453, 4000, 2, 80, relayerKey, relayer, 0);
        assertEq(registry.relayerNonce(relayer), 1);

        // Second update (same chain, nonce = 1)
        _doReputationUpdate(agentId, 8453, 4500, 2, 90, relayerKey, relayer, 1);
        assertEq(registry.relayerNonce(relayer), 2);
    }

    // ─── Batch Update Tests ────────────────────────────────────────────

    function test_batchUpdateReputation() public {
        // Register 3 agents with 4-segment IDs
        string memory id1 = string.concat("eip155:8453:", IDENTITY_REGISTRY, ":100");
        string memory id2 = string.concat("eip155:8453:", IDENTITY_REGISTRY, ":101");
        string memory id3 = string.concat("eip155:8453:", IDENTITY_REGISTRY, ":102");

        bytes32 aid1 = registry.registerAgent(id1, address(0x1111111111111111111111111111111111111111));
        bytes32 aid2 = registry.registerAgent(id2, address(0x2222222222222222222222222222222222222222));
        bytes32 aid3 = registry.registerAgent(id3, address(0x3333333333333333333333333333333333333333));

        bytes32[] memory agentIds = new bytes32[](3);
        agentIds[0] = aid1;
        agentIds[1] = aid2;
        agentIds[2] = aid3;

        uint256[] memory chainIds = new uint256[](3);
        chainIds[0] = 8453;
        chainIds[1] = 8453;
        chainIds[2] = 8453;

        IMasterRegistry.ChainReputation[] memory reps = new IMasterRegistry.ChainReputation[](3);
        reps[0] = IMasterRegistry.ChainReputation(3500, 2, 70, uint40(block.timestamp), 8453);
        reps[1] = IMasterRegistry.ChainReputation(4000, 2, 80, uint40(block.timestamp), 8453);
        reps[2] = IMasterRegistry.ChainReputation(4500, 2, 90, uint40(block.timestamp), 8453);

        bytes[] memory sigs = new bytes[](3);
        for (uint256 i; i < 3; i++) {
            uint256 nonce = registry.relayerNonce(relayer) + i;
            bytes32 digest = SigUtils.getReputationMessageHash(
                agentIds[i], chainIds[i], reps[i].summaryValue, reps[i].summaryValueDecimals, reps[i].feedbackCount, nonce
            );
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerKey, digest);
            sigs[i] = abi.encodePacked(r, s, v);
        }

        vm.prank(relayer);
        registry.batchUpdateReputation(agentIds, chainIds, reps, sigs);

        assertEq(registry.getChainReputation(aid1, 8453).summaryValue, 3500);
        assertEq(registry.getChainReputation(aid2, 8453).summaryValue, 4000);
        assertEq(registry.getChainReputation(aid3, 8453).summaryValue, 4500);
        assertEq(registry.relayerNonce(relayer), 3);
    }

    // ─── Unified Reputation Tests ─────────────────────────────────────

    function test_getUnifiedReputation_singleChain() public {
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);
        _doReputationUpdate(agentId, 8453, 4200, 3, 100, relayerKey, relayer, 0);

        (int128 value, uint8 decimals, uint64 count) = registry.getUnifiedReputation(agentId);
        assertEq(value, 4200);
        assertEq(decimals, 3);
        assertEq(count, 100);
    }

    function test_getUnifiedReputation_multiChain() public {
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);

        // Base: value=4000, decimals=2, count=100
        _doReputationUpdate(agentId, 8453, 4000, 2, 100, relayerKey, relayer, 0);
        // Arbitrum: value=3000, decimals=2, count=50
        _doReputationUpdate(agentId, 42161, 3000, 2, 50, relayerKey, relayer, 1);

        (int128 value, uint8 decimals, uint64 count) = registry.getUnifiedReputation(agentId);
        // Weighted: (4000*100 + 3000*50) / (100+50) = (400000 + 150000) / 150 = 3666
        assertEq(value, 3666);
        assertEq(decimals, 2);
        assertEq(count, 150);
    }

    function test_getUnifiedReputation_differentDecimals() public {
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);

        // Base: value=42, decimals=1, count=100  (represents 4.2)
        _doReputationUpdate(agentId, 8453, 42, 1, 100, relayerKey, relayer, 0);
        // Arbitrum: value=350, decimals=2, count=50  (represents 3.50)
        _doReputationUpdate(agentId, 42161, 350, 2, 50, relayerKey, relayer, 1);

        (int128 value, uint8 decimals, uint64 count) = registry.getUnifiedReputation(agentId);
        // Normalize to decimals=2: Base=420, Arb=350
        // Weighted: (420*100 + 350*50) / 150 = (42000 + 17500) / 150 = 396
        assertEq(decimals, 2);
        assertEq(value, 396);
        assertEq(count, 150);
    }

    function test_getUnifiedReputation_noReputation() public {
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);
        (int128 value, uint8 decimals, uint64 count) = registry.getUnifiedReputation(agentId);
        assertEq(value, 0);
        assertEq(decimals, 0);
        assertEq(count, 0);
    }

    // ─── Resolve Tests ─────────────────────────────────────────────────

    function test_resolveAgent_full() public {
        // Register on Base
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);

        // Link Arbitrum identity
        bytes32 digest = SigUtils.getLinkMessageHash(agentId, globalIdBase, globalIdArb, block.chainid);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKeyB, digest);
        registry.linkIdentity(globalIdBase, globalIdArb, agentAddrB, abi.encodePacked(r, s, v));

        // Add reputation on both chains
        _doReputationUpdate(agentId, 8453, 4000, 2, 100, relayerKey, relayer, 0);
        _doReputationUpdate(agentId, 42161, 3000, 2, 50, relayerKey, relayer, 1);

        // Resolve from either identity
        IMasterRegistry.UnifiedAgentView memory view1 = registry.resolveAgent(globalIdBase);
        IMasterRegistry.UnifiedAgentView memory view2 = registry.resolveAgent(globalIdArb);

        // Both should return the same agentId
        assertEq(view1.agentId, agentId);
        assertEq(view2.agentId, agentId);

        // 2 identities
        assertEq(view1.globalAgentIds.length, 2);

        // 2 chains with reputation
        assertEq(view1.chainIds.length, 2);
        assertEq(view1.reputations.length, 2);

        // Unified reputation: (4000*100 + 3000*50) / 150 = 3666
        assertEq(view1.unifiedValue, 3666);
        assertEq(view1.unifiedValueDecimals, 2);
        assertEq(view1.totalFeedbackCount, 150);

        // Owner address
        assertEq(view1.ownerAddress, agentAddrA);
    }

    function test_resolveAgent_revertNotFound() public {
        vm.expectRevert(IMasterRegistry.AgentNotFound.selector);
        registry.resolveAgent("eip155:1:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:999");
    }

    // ─── Admin Tests ───────────────────────────────────────────────────

    function test_addRelayer() public {
        address newRelayer = address(0xBEEF);
        registry.addRelayer(newRelayer);
        assertTrue(registry.isRelayer(newRelayer));
    }

    function test_removeRelayer() public {
        registry.removeRelayer(relayer);
        assertFalse(registry.isRelayer(relayer));
    }

    function test_addRelayer_revertZeroAddress() public {
        vm.expectRevert(IMasterRegistry.ZeroAddress.selector);
        registry.addRelayer(address(0));
    }

    function test_addRelayer_revertNotOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        registry.addRelayer(address(0xBEEF));
    }

    // ─── Upgrade Tests ─────────────────────────────────────────────────

    function test_upgrade_preservesState() public {
        // Register agent
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);
        _doReputationUpdate(agentId, 8453, 4200, 3, 100, relayerKey, relayer, 0);

        // Deploy new implementation
        MasterRegistry newImpl = new MasterRegistry();

        // Upgrade
        registry.upgradeToAndCall(address(newImpl), "");

        // Verify state preserved
        assertEq(registry.totalAgents(), 1);
        assertEq(registry.getAgentId(globalIdBase), agentId);
        assertEq(registry.getChainReputation(agentId, 8453).summaryValue, 4200);
    }

    function test_upgrade_revertNotOwner() public {
        MasterRegistry newImpl = new MasterRegistry();
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        registry.upgradeToAndCall(address(newImpl), "");
    }

    // ─── getChainReputation edge case ──────────────────────────────────

    function test_getChainReputation_revertChainNotFound() public {
        bytes32 agentId = registry.registerAgent(globalIdBase, agentAddrA);
        vm.expectRevert(IMasterRegistry.ChainNotFound.selector);
        registry.getChainReputation(agentId, 999);
    }

    // ─── Batch 10 agents ───────────────────────────────────────────────

    function test_batchUpdate_10agents() public {
        uint256 n = 10;
        bytes32[] memory agentIds = new bytes32[](n);
        uint256[] memory chainIds = new uint256[](n);
        IMasterRegistry.ChainReputation[] memory reps = new IMasterRegistry.ChainReputation[](n);
        bytes[] memory sigs = new bytes[](n);

        for (uint256 i; i < n; i++) {
            address addr = address(uint160(0x1000 + i));
            string memory gid = string.concat(
                "eip155:8453:", IDENTITY_REGISTRY, ":",
                vm.toString(200 + i)
            );
            agentIds[i] = registry.registerAgent(gid, addr);
            chainIds[i] = 8453;
            reps[i] = IMasterRegistry.ChainReputation(
                int128(int256(3500 + int256(uint256(i)) * 100)),
                2,
                uint64(70 + i),
                uint40(block.timestamp),
                8453
            );

            uint256 nonce = i; // nonces are sequential
            bytes32 digest = SigUtils.getReputationMessageHash(
                agentIds[i], chainIds[i], reps[i].summaryValue, reps[i].summaryValueDecimals,
                reps[i].feedbackCount, nonce
            );
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerKey, digest);
            sigs[i] = abi.encodePacked(r, s, v);
        }

        vm.prank(relayer);
        registry.batchUpdateReputation(agentIds, chainIds, reps, sigs);

        assertEq(registry.totalAgents(), n);
        for (uint256 i; i < n; i++) {
            assertEq(
                registry.getChainReputation(agentIds[i], 8453).summaryValue,
                int128(int256(3500 + int256(uint256(i)) * 100))
            );
        }
    }

    // ─── Format Validation Tests ───────────────────────────────────────

    function test_validate_rejects3Segment() public {
        vm.expectRevert(IMasterRegistry.InvalidGlobalAgentIdFormat.selector);
        registry.registerAgent("eip155:8453:0xAbCdEf0123456789AbCdEf0123456789AbCdEf01", agentAddrA);
    }

    function test_validate_accepts4Segment() public {
        bytes32 agentId = registry.registerAgent(
            "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:42",
            agentAddrA
        );
        assertNotEq(agentId, bytes32(0));
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    function _doReputationUpdate(
        bytes32 agentId,
        uint256 chainId,
        int128 summaryValue,
        uint8 summaryValueDecimals,
        uint64 feedbackCount,
        uint256 signerKey,
        address signerAddr,
        uint256 nonce
    ) internal {
        IMasterRegistry.ChainReputation memory rep = IMasterRegistry.ChainReputation({
            summaryValue: summaryValue,
            summaryValueDecimals: summaryValueDecimals,
            feedbackCount: feedbackCount,
            lastUpdated: uint40(block.timestamp),
            sourceChainId: chainId
        });

        bytes32 digest = SigUtils.getReputationMessageHash(
            agentId, chainId, summaryValue, summaryValueDecimals, feedbackCount, nonce
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);

        vm.prank(signerAddr);
        registry.updateReputation(agentId, chainId, rep, abi.encodePacked(r, s, v));
    }
}

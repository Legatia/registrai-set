// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

library SigUtils {
    /// @notice Create a link identity message hash for signing
    function getLinkMessageHash(
        bytes32 agentId,
        string memory globalAgentIdA,
        string memory globalAgentIdB,
        uint256 chainId
    ) internal pure returns (bytes32) {
        bytes32 raw = keccak256(
            abi.encode(
                "MasterRegistry:linkIdentity:v1",
                agentId,
                keccak256(bytes(globalAgentIdA)),
                keccak256(bytes(globalAgentIdB)),
                chainId
            )
        );
        return MessageHashUtils.toEthSignedMessageHash(raw);
    }

    /// @notice Create a reputation update message hash for signing
    function getReputationMessageHash(
        bytes32 agentId,
        uint256 chainId,
        int128 summaryValue,
        uint8 summaryValueDecimals,
        uint64 feedbackCount,
        uint256 nonce
    ) internal pure returns (bytes32) {
        bytes32 raw = keccak256(
            abi.encode(agentId, chainId, summaryValue, summaryValueDecimals, feedbackCount, nonce)
        );
        return MessageHashUtils.toEthSignedMessageHash(raw);
    }
}

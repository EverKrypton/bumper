// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Disperser {
    function disperseEth(address payable[] calldata recipients, uint256[] calldata values) external payable {
        uint256 total = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            total += values[i];
        }
        require(total == msg.value, "Total value does not match sent ETH");

        for (uint256 i = 0; i < recipients.length; i++) {
            recipients[i].transfer(values[i]);
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRegistry {
    function buyPolicy(bytes32, uint128, uint64) external payable returns (uint256);
    function fileClaim(uint256, bytes32, uint128) external returns (uint256);
    function withdrawPayout(uint256) external;
}

contract ReentrancyAttacker {
    IRegistry public registry;
    address public owner;
    uint256 public policyId;
    uint256 public claimId;
    bool public attempted;
    bool public reentered;
    bool public rejectPayment;

    error NotOwner();
    error PaymentRejected();

    constructor(address target) {
        registry = IRegistry(target);
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function buyPolicy(bytes32 terms, uint128 coverage, uint64 duration) external payable onlyOwner {
        policyId = registry.buyPolicy{value: msg.value}(terms, coverage, duration);
    }

    function fileClaim(bytes32 evidence, uint128 amount) external onlyOwner {
        claimId = registry.fileClaim(policyId, evidence, amount);
    }

    function setRejectPayment(bool value) external onlyOwner {
        rejectPayment = value;
    }

    function withdraw() external onlyOwner {
        registry.withdrawPayout(claimId);
    }

    receive() external payable {
        if (rejectPayment) revert PaymentRejected();

        if (!attempted) {
            attempted = true;

            try registry.withdrawPayout(claimId) {
                reentered = true;
            } catch {}
        }
    }
}

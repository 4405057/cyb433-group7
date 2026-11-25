// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PeerInsuranceRegistry {
    enum PolicyStatus { None, Active, Cancelled, Expired, Claimed }
    enum ClaimStatus { None, Filed, Approved, Rejected, Paid }
    enum Role { Underwriter, Assessor }

    struct Policy {
        bytes32 termsHash;
        address holder;
        uint128 coverage;
        uint64 startTime;
        uint64 endTime;
        PolicyStatus status;
    }

    struct Claim {
        uint256 policyId;
        address claimant;
        bytes32 evidenceHash;
        uint128 amount;
        uint64 filedAt;
        uint8 approvals;
        ClaimStatus status;
    }

    uint256 public constant PREMIUM_BPS = 500;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint64 public constant WAITING_PERIOD = 7 days;
    uint64 public constant MIN_DURATION = 30 days;
    uint64 public constant MAX_DURATION = 365 days;
    uint8 public constant REQUIRED_APPROVALS = 2;

    address public admin;
    mapping(address => bool) public isUnderwriter;
    mapping(address => bool) public isAssessor;
    mapping(uint256 => Policy) private policies;
    mapping(uint256 => Claim) private claims;
    mapping(uint256 => uint256) public claimOfPolicy;
    mapping(bytes32 => bool) public evidenceUsed;
    mapping(uint256 => mapping(address => bool)) public hasApproved;

    uint256 public policyCount;
    uint256 public claimCount;
    uint256 public reserved;
    uint256 public totalPaid;
    address public pendingAdmin;

    event PolicyIssued(uint256 indexed policyId, address indexed holder, uint128 coverage, uint64 endTime, bytes32 termsHash);
    event PolicyCancelled(uint256 indexed policyId, address indexed by, bytes32 reasonHash);
    event PolicyExpired(uint256 indexed policyId);
    event ClaimFiled(uint256 indexed claimId, uint256 indexed policyId, address indexed claimant, uint128 amount, bytes32 evidenceHash);
    event ClaimApprovalAdded(uint256 indexed claimId, address indexed assessor, uint8 approvals);
    event ClaimApproved(uint256 indexed claimId, uint128 amount);
    event ClaimRejected(uint256 indexed claimId, address indexed assessor);
    event PayoutWithdrawn(uint256 indexed claimId, address indexed claimant, uint128 amount);
    event RoleGranted(Role indexed role, address indexed account);
    event RoleRevoked(Role indexed role, address indexed account);
    event AdminProposed(address indexed newAdmin);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);

    error NotAdmin();
    error NotUnderwriter();
    error NotAssessor();
    error NotPolicyHolder();
    error NotClaimant();
    error NotPendingAdmin();
    error ZeroAddress();
    error ZeroHash();
    error InvalidAmount();
    error InvalidDuration();
    error WrongPremium(uint256 sent, uint256 required);
    error PolicyNotFound(uint256 id);
    error ClaimNotFound(uint256 id);
    error InvalidPolicyStatus(PolicyStatus current);
    error InvalidClaimStatus(ClaimStatus current);
    error PolicyNotEnded();
    error ClaimTooEarly(uint64 availableAt);
    error ClaimWindowClosed();
    error AmountExceedsCoverage();
    error ClaimAlreadyFiled(uint256 claimId);
    error EvidenceAlreadyUsed();
    error AlreadyApproved();
    error SelfReviewNotAllowed();
    error InsufficientPool(uint256 available, uint256 needed);
    error RoleAlreadyGranted();
    error RoleNotGranted();
    error TransferFailed();

    constructor() {
        admin = msg.sender;
        isUnderwriter[msg.sender] = true;
        emit RoleGranted(Role.Underwriter, msg.sender);
    }

    modifier onlyUnderwriter() {
        if (!isUnderwriter[msg.sender]) revert NotUnderwriter();
        _;
    }

    modifier onlyAssessor() {
        if (!isAssessor[msg.sender]) revert NotAssessor();
        _;
    }

    modifier onlyAdmin() {
    if (msg.sender != admin) revert NotAdmin();
    _;
}

    function buyPolicy(bytes32 termsHash, uint128 coverage, uint64 duration) external payable returns (uint256) {
        if (termsHash == 0) revert ZeroHash();
        if (coverage == 0) revert InvalidAmount();
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert InvalidDuration();

        uint256 requiredPremium = (uint256(coverage) * PREMIUM_BPS) / BPS_DENOMINATOR;
        if (requiredPremium == 0 || msg.value != requiredPremium)
        revert WrongPremium(msg.value, requiredPremium);

        policyCount++;
        uint256 policyId = policyCount;
        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = startTime + duration;

        policies[policyId] = Policy({
            termsHash: termsHash,
            holder: msg.sender,
            coverage: coverage,
            startTime: startTime,
            endTime: endTime,
            status: PolicyStatus.Active
        });

        emit PolicyIssued(policyId, msg.sender, coverage, endTime, termsHash);
        return policyId;
    }

    function getPolicy(uint256 id) external view returns (Policy memory) {
        Policy memory p = policies[id];
       if (id == 0 || id > policyCount) revert PolicyNotFound(id);
        return p;
    }

    function verifyPolicy(uint256 id) external view returns (bool) {
        Policy memory p = policies[id];
        if (p.status != PolicyStatus.Active) return false;
        if (block.timestamp > p.endTime) return false;
        return true;
    }

    function cancelPolicy(uint256 id, bytes32 reasonHash) external onlyUnderwriter {
        Policy storage p = policies[id];
        if (p.status == PolicyStatus.None) revert PolicyNotFound(id);
        if (p.status != PolicyStatus.Active) revert InvalidPolicyStatus(p.status);

        p.status = PolicyStatus.Cancelled;
        emit PolicyCancelled(id, msg.sender, reasonHash);
    }

    function markExpired(uint256 id) external {
        Policy storage p = policies[id];
        if (p.status == PolicyStatus.None) revert PolicyNotFound(id);
        if (p.status != PolicyStatus.Active) revert InvalidPolicyStatus(p.status);
        if (block.timestamp <= p.endTime) revert PolicyNotEnded();

        p.status = PolicyStatus.Expired;
        emit PolicyExpired(id);
    }

function fileClaim(uint256 policyId, bytes32 evidenceHash, uint128 amount) external returns (uint256) {
    Policy storage  p = policies[policyId];
    if (policyId == 0 || policyId > policyCount) revert PolicyNotFound(policyId);
    if (msg.sender != p.holder) revert NotPolicyHolder();
    if (p.status != PolicyStatus.Active) revert InvalidPolicyStatus(p.status);
    if (evidenceHash == 0) revert ZeroHash();
    if (amount == 0) revert InvalidAmount();

    uint256 existing = claimOfPolicy[policyId];
    if (existing != 0) revert ClaimAlreadyFiled(existing);

    uint64 availableAt = p.startTime + WAITING_PERIOD;
    if (block.timestamp < availableAt) revert ClaimTooEarly(availableAt);
    if (block.timestamp > p.endTime) revert ClaimWindowClosed();

    if (amount > p.coverage) revert AmountExceedsCoverage();
    if (evidenceUsed[evidenceHash]) revert EvidenceAlreadyUsed();

    claimCount++;
    uint256 claimId = claimCount;
    evidenceUsed[evidenceHash] = true;
    claimOfPolicy[policyId] = claimId;

    claims[claimId] = Claim({
        policyId: policyId,
        claimant: msg.sender,
        evidenceHash: evidenceHash,
        amount: amount,
        filedAt: uint64(block.timestamp),
        approvals: 0,
        status: ClaimStatus.Filed
    });

    emit ClaimFiled(claimId, policyId, msg.sender, amount, evidenceHash);
    return claimId;
}

    function getClaim(uint256 id) external view returns (Claim memory) {
        Claim memory c = claims[id];
        if (id == 0 || id > claimCount) revert ClaimNotFound(id);
        return c;
    }

    function poolStats() external view returns (uint256 balance, uint256 res, uint256 available, uint256 paid) {
        balance = address(this).balance;
        res = reserved;
        available = balance > res ? balance - res : 0;
        paid = totalPaid;
    }

function grantRole(Role role, address account) external onlyAdmin {
    if (account == address(0)) revert ZeroAddress();
    if (role == Role.Underwriter) {
        if (isUnderwriter[account]) revert RoleAlreadyGranted();
        isUnderwriter[account] = true;
    } else {
        if (isAssessor[account]) revert RoleAlreadyGranted();
        isAssessor[account] = true;
    }
    emit RoleGranted(role, account);
}

function revokeRole(Role role, address account) external onlyAdmin {
    if (account == address(0)) revert ZeroAddress();
    if (role == Role.Underwriter) {
        if (!isUnderwriter[account]) revert RoleNotGranted();
        isUnderwriter[account] = false;
    } else {
        if (!isAssessor[account]) revert RoleNotGranted();
        isAssessor[account] = false;
    }
    emit RoleRevoked(role, account);
}

function proposeAdmin(address newAdmin) external onlyAdmin {
    if (newAdmin == address(0)) revert ZeroAddress();
    pendingAdmin = newAdmin;
    emit AdminProposed(newAdmin);
}

function acceptAdmin() external {
    if (msg.sender != pendingAdmin) revert NotPendingAdmin();
    address oldAdmin = admin;
    admin = msg.sender;
    pendingAdmin = address(0);
    emit AdminChanged(oldAdmin, msg.sender);
}

function approveClaim(uint256 claimId) external onlyAssessor {
    Claim storage c = claims[claimId];
    if (c.status == ClaimStatus.None) revert ClaimNotFound(claimId);
    if (c.status != ClaimStatus.Filed) revert InvalidClaimStatus(c.status);
    if (msg.sender == c.claimant) revert SelfReviewNotAllowed();
    if (hasApproved[claimId][msg.sender]) revert AlreadyApproved();

    hasApproved[claimId][msg.sender] = true;
    uint8 approvals = c.approvals + 1;
    c.approvals = approvals;
    emit ClaimApprovalAdded(claimId, msg.sender, approvals);

    if (approvals == REQUIRED_APPROVALS) {
        uint256 currentReserved = reserved;
        uint256 balance = address(this).balance;
        uint256 available = balance > currentReserved ? balance - currentReserved : 0;
        if (c.amount > available) revert InsufficientPool(available, c.amount);
        reserved = currentReserved + c.amount;
        c.status = ClaimStatus.Approved;
        emit ClaimApproved(claimId, c.amount);
    }
}

function rejectClaim(uint256 claimId) external onlyAssessor {
    Claim storage c = claims[claimId];
    if (c.status == ClaimStatus.None) revert ClaimNotFound(claimId);
    if (c.status != ClaimStatus.Filed) revert InvalidClaimStatus(c.status);
    if (msg.sender == c.claimant) revert SelfReviewNotAllowed();

    c.status = ClaimStatus.Rejected;
    emit ClaimRejected(claimId, msg.sender);
}

function withdrawPayout(uint256 claimId) external {
    Claim storage c = claims[claimId];
    if (c.status == ClaimStatus.None) revert ClaimNotFound(claimId);
    if (msg.sender != c.claimant) revert NotClaimant();
    if (c.status != ClaimStatus.Approved) revert InvalidClaimStatus(c.status);

    uint128 amount = c.amount;
    c.status = ClaimStatus.Paid;
    policies[c.policyId].status = PolicyStatus.Claimed;
    reserved -= amount;
    totalPaid += amount;
    emit PayoutWithdrawn(claimId, msg.sender, amount);

    (bool ok, ) = msg.sender.call{value: amount}("");
    if (!ok) revert TransferFailed();
}

}

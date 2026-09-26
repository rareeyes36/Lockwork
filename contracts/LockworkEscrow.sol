// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Minimal ERC-20 surface used by the escrow.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Lockwork escrow (Base + USDC)
/// @notice The employer locks a job's full payout. Only that employer can release
///         it to a winner (2.5% fee on release only) or refund what is left
///         (no fee). Nobody else, including the deployer, can move locked funds.
///         One lock can be released in parts: carve-out sub-jobs pay their winners
///         out of the root escrow, then the residual goes to the root winner.
/// @dev    No upgrades, no admin withdrawal, no pausing. Testnet demo contract:
///         not audited, so do not deploy with real funds.
contract LockworkEscrow {
    struct Escrow {
        address employer;
        uint256 remaining;
    }

    IERC20 public immutable token;
    address public immutable feeRecipient;
    uint16 public immutable feeBps;

    mapping(bytes32 => Escrow) public escrows;

    uint256 private _entered = 1;

    event Locked(bytes32 indexed jobKey, address indexed employer, uint256 amount);
    event Released(bytes32 indexed jobKey, address indexed winner, uint256 amount, uint256 fee, uint256 net);
    event Refunded(bytes32 indexed jobKey, address indexed employer, uint256 amount);

    error ZeroAddress();
    error FeeTooHigh();
    error ZeroAmount();
    error AlreadyLocked();
    error NotEmployer();
    error InsufficientEscrow();
    error NothingToRefund();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_entered != 1) revert Reentrancy();
        _entered = 2;
        _;
        _entered = 1;
    }

    constructor(IERC20 token_, address feeRecipient_, uint16 feeBps_) {
        if (address(token_) == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();
        if (feeBps_ > 1000) revert FeeTooHigh(); // hard cap 10%
        token = token_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    /// @notice Lock `amount` for `jobKey`. Requires a prior `approve`. Fee: 0.
    function lock(bytes32 jobKey, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Escrow storage e = escrows[jobKey];
        if (e.employer != address(0)) revert AlreadyLocked();
        e.employer = msg.sender;
        e.remaining = amount;
        _pull(msg.sender, amount);
        emit Locked(jobKey, msg.sender, amount);
    }

    /// @notice Pay `amount` of the escrow to `winner`; 2.5% goes to the platform.
    function release(bytes32 jobKey, address winner, uint256 amount) external nonReentrant {
        Escrow storage e = escrows[jobKey];
        if (msg.sender != e.employer) revert NotEmployer();
        if (winner == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > e.remaining) revert InsufficientEscrow();
        e.remaining -= amount;
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 net = amount - fee;
        _push(winner, net);
        if (fee > 0) _push(feeRecipient, fee);
        emit Released(jobKey, winner, amount, fee, net);
    }

    /// @notice Return everything still locked to the employer. Fee: 0.
    function refund(bytes32 jobKey) external nonReentrant {
        Escrow storage e = escrows[jobKey];
        if (msg.sender != e.employer) revert NotEmployer();
        uint256 amount = e.remaining;
        if (amount == 0) revert NothingToRefund();
        e.remaining = 0;
        _push(e.employer, amount);
        emit Refunded(jobKey, e.employer, amount);
    }

    function _pull(address from, uint256 amount) private {
        (bool ok, bytes memory data) =
            address(token).call(abi.encodeCall(IERC20.transferFrom, (from, address(this), amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _push(address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}

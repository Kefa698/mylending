// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

error TokenNotAllowed(address token);

contract Lending is ReentrancyGuard, Ownable {
    mapping(address => address) public s_tokenToPricefeed;
    address[] public s_allowedTokens;

    //account   ->token   ->amount
    mapping(address => mapping(address => uint256)) public s_accountToTokenDeposits;

    //account   ->token   ->amount
    mapping(address => mapping(address => uint256)) public s_accountToTokenBorrows;

    // 5% Liquidation Reward
    uint256 public constant LIQUIDATION_REWARD = 5;
    // At 80% Loan to Value Ratio, the loan can be liquidated
    uint256 public constant LIQUIDATION_THRESHOLD = 80;
    uint256 public constant MIN_HEALH_FACTOR = 1e18;

    event AllowedTokenSet(address indexed token, address indexed priceFeed);
    event Deposit(address indexed account, address indexed token, uint256 indexed amount);
    event Withdraw(address indexed account, address indexed token, uint256 indexed amount);
    event Borrow(address indexed account, address indexed token, uint256 indexed amount);
    event Repay(address indexed account, address indexed token, uint256 indexed amount);
    event Liquidate(
        address indexed account,
        address indexed repayToken,
        address indexed rewardToken,
        uint256 halfDebtInEth,
        address liquidator
    );

    function depost(address token, uint256 amount)
        external
        nonReentrant
        isAllowedToken(token)
        moreThanZero(amount)
    {
        emit Deposit(msg.sender, token, amount);
        s_accountToTokenDeposits[msg.sender][token] += amount;
        bool succes = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(succes, "transfer failed");
    }

    function withdraw(address token, uint256 amount) external nonReentrant moreThanZero(amount) {
        require(s_accountToTokenDeposits[msg.sender][token] >= amount, "not eneogh funds");
        emit Withdraw(msg.sender, token, amount);
        _pullfunds(msg.sender, token, amount);
        require(healthfactor(msg.sender) >= LIQUIDATION_THRESHOLD, "platform will go insolvent");
    }

    function _pullfunds(
        address account,
        address token,
        uint256 amount
    ) private {
        require(s_accountToTokenDeposits[account][token] >= amount, "not eneogh funds to withdraw");
        s_accountToTokenDeposits[account][token] -= amount;
        bool success = IERC20(token).transfer(msg.sender, amount);
        require(success, "transfer failed");
    }

    function borrow(address token, uint256 amount)
        external
        nonReentrant
        isAllowedToken(token)
        moreThanZero(amount)
    {
        require(IERC20(token).balanceOf(address(this)) >= amount, "not eneogh funds to borrow");
        s_accountToTokenBorrows[msg.sender][token] += amount;
        emit Borrow(msg.sender, token, amount);
        bool success = IERC20(token).transfer(msg.sender, amount);
        require(success, "transfer failed");
    }

    function repay(address token, uint256 amount)
        external
        nonReentrant
        isAllowedToken(token)
        moreThanZero(amount)
    {
        emit Repay(msg.sender, token, amount);
        _pullfunds(msg.sender, token, amount);
    }

    function _repay(
        address account,
        address token,
        uint256 amount
    ) private {
        s_accountToTokenBorrows[account][token] -= amount;
        bool success = IERC20(token).transferFrom(msg.sender, token, amount);
        require(success, "transfer failed");
    }

    function liquidate(
        address account,
        address repayToken,
        address rewardToken
    ) external {
        require(healthfactor(account) < MIN_HEALH_FACTOR, "account cant be liquidated");
        uint256 halfDebt = (s_accountToTokenBorrows[account][repayToken]) / 2;
        uint256 halfDebtInEth = getEthValue(repayToken, halfDebt);
        require(halfDebtInEth > 0, "choose a different repay token");
        uint256 rewardAmounInEth = (halfDebtInEth * LIQUIDATION_REWARD) / 100;
        uint256 totalRewardAmountInRewardToken = getTokenValusFromEth(
            rewardToken,
            rewardAmounInEth + halfDebtInEth
        );
        emit Liquidate(account, repayToken, rewardToken, halfDebtInEth, msg.sender);
        _repay(account, repayToken, halfDebt);
        _pullfunds(account, rewardToken, totalRewardAmountInRewardToken);
    }

    function getAccountInformation(address user)
        public
        view
        returns (uint256 borrowedValueInEth, uint256 colateralValueInEth)
    {
        borrowedValueInEth = getAccountBorrowValue(user);
        colateralValueInEth = getAccountCollateralValue(user);
    }

    function getAccountBorrowValue(address user) public view returns (uint256) {
        uint256 totalBorrowedValueInEth = 0;
        for (uint256 i = 0; i < s_allowedTokens.length; i++) {
            address token = s_allowedTokens[i];
            uint256 amount = s_accountToTokenBorrows[user][token];
            uint256 valueInEth = getEthValue(token, amount);
            totalBorrowedValueInEth += valueInEth;
        }
        return totalBorrowedValueInEth;
    }

    function getAccountCollateralValue(address user) public view returns (uint256) {
        uint256 totalCollateralValueInEth = 0;
        for (uint256 i = 0; i < s_allowedTokens.length; i++) {
            address token = s_allowedTokens[i];
            uint256 amount = s_accountToTokenDeposits[user][token];
            uint256 valueInEth = getEthValue(token, amount);
            totalCollateralValueInEth += valueInEth;
        }
        return totalCollateralValueInEth;
    }

    function getEthValue(address token, uint256 amount) public view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(s_tokenToPricefeed[token]);
        (, int256 price, , , ) = priceFeed.latestRoundData();
        return (uint256(price) * amount) / 1e18;
    }

    function getTokenValusFromEth(address token, uint256 amount) public view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(s_tokenToPricefeed[token]);
        (, int256 price, , , ) = priceFeed.latestRoundData();
        return (amount * 1e18) / uint256(price);
    }

    function healthfactor(address acoount) public view returns (uint256) {
        (uint256 borrowedValueInEth, uint256 collateralValueInEth) = getAccountInformation(acoount);
        uint256 collateralAdjustedThreshold = ((collateralValueInEth * LIQUIDATION_THRESHOLD) /
            100);
        if (borrowedValueInEth == 0) return 100e18;
        return (collateralAdjustedThreshold * 1e18) / borrowedValueInEth;
    }

    ////modifiers////////////////
    modifier isAllowedToken(address token) {
        require(s_tokenToPricefeed[token] != address(0), "token is not allowed");
        _;
    }
    modifier moreThanZero(uint256 amount) {
        require(amount > 0, "amount should be more than zero");
        _;
    }

    ////Dao//onlyOwner function
    function setAllowedToken(address token, address priceFeed) external onlyOwner {
        bool foundToken = false;
        for (uint256 i = 0; i < s_allowedTokens.length; i++) {
            if (s_allowedTokens[i] == token) {
                foundToken == true;
            }
            if (!foundToken) {
                s_allowedTokens.push(token);
            }
            s_tokenToPricefeed[token] = priceFeed;
            emit AllowedTokenSet(token, priceFeed);
        }
    }
}

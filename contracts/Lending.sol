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

    function getCollateralValue(address user) public view returns (uint256) {
        uint256 totalCollateralValueInEth = 0;
        for (uint256 i = 0; i < s_allowedTokens.length; i++) {
            address token = s_allowedTokens[i];
            uint256 amount = s_accountToTokenDeposits[user][token];
            uint256 valueInEth = getEthValue(token, amount);
            totalCollateralValueInEth += valueInEth;
            return totalCollateralValueInEth;
        }
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

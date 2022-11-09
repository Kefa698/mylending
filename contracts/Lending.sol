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
    event Deposit(address indexed user, address indexed token, uint256 indexed amount);

    ////modifiers////////////////
    modifier isAllowedToken(address token) {
        require(s_tokenToPricefeed[token] != address(0), "token is not allowed");
        _;
    }
    modifier moreThanZero(uint256 amount) {
        require(amount > 0, "amount should be more than zero");
        _;
    }

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

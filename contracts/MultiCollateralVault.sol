// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@yield-protocol/utils-v2/contracts/token/TransferHelper.sol";

struct PriceFeed {
    address feed;
    uint8 decimals;
}

// @title  MultiCollateral Vault - An exercise for the Yield Mentorship program
// @notice Deposit ERC20 Tokens - Borrow Dai
contract MultiCollateralVault {
    address public owner;
    IERC20 public daiToken;
    mapping(address => bool) public tokensAcceptedMapping; // a mapping used to determine if a token is accepted
    mapping(address => PriceFeed) public priceFeeds; // token => { aggregator contract, decimals cached }
    mapping(address => mapping(address => uint256)) public deposits; // user address =>  token address => balance
    mapping(address => address[]) public tokensDeposited; // user address => array of previously deposited tokens
    mapping(address => uint256) public loans; // Amounts in dai

    event Deposit(address indexed token, uint256 wad);
    event Withdraw(address indexed token, uint256 wad);
    event Borrow(uint256 wad);
    event Repay(uint256 wad);
    event Liquidate(address indexed guy, uint256 loanDaiAmt);
    event SetAcceptedToken(address indexed token, address indexed feed);

    // @dev Deploy with address of Dai Stablecoin token
    constructor(address daiToken_) {
        owner = msg.sender;
        daiToken = IERC20(daiToken_);
    }

    //@notice Function used to get latest Dai/token exchange from price feed
    //@dev For simplicity, we are using usd exchange rates instead of dai
    //@param token ERC20 token address to get rate for
    function _getExchangeRate(address token) internal view returns (uint256 rate, uint8 decimals) {
        require(tokensAcceptedMapping[token], "Invalid token");
        PriceFeed memory feedData = priceFeeds[token];
        (, int256 answer, , , ) = AggregatorV3Interface(feedData.feed).latestRoundData();
        require(answer > 0, "Invalid data");
        rate = uint256(answer);
        decimals = uint8(feedData.decimals);
    }

    //@notice Function used to update the list of tokensDeposited for each user
    //@dev We are intentionally not removing tokens from this list when balances drop to zero
    //@dev because its deemed not worth the extra code and gas
    //@param guy User address to update
    //@param token ERC20 token address to add
    function _updateTokensDeposited(address guy, address token) internal {
        bool hasToken = false;
        address[] memory tokensDeposited_ = tokensDeposited[guy];
        for (uint256 idx = 0; idx < tokensDeposited_.length; idx++) {
            if (address(tokensDeposited_[idx]) == token) {
                hasToken = true;
                break;
            }
        }
        if (!hasToken) {
            tokensDeposited[guy].push(token);
        }
    }

    //@notice Function used to deposit ERC20 tokens
    //@param token ERC20 token address
    //@param wad Amount of token to deposit
    function deposit(address token, uint256 wad) external {
        require(tokensAcceptedMapping[token], "Invalid token");
        require(wad > 0, "Amount > 0 required");
        deposits[msg.sender][token] = deposits[msg.sender][token] + wad;
        _updateTokensDeposited(msg.sender, token);
        TransferHelper.safeTransferFrom(IERC20(token), msg.sender, address(this), wad);
        emit Deposit(token, wad);
    }

    //@notice Function used to withdraw ERC20 tokens
    //@param token Token depositing
    //@param wad Amount of token to deposit
    function withdraw(address token, uint256 wad) external {
        require(tokensAcceptedMapping[token], "Invalid token");
        require(wad > 0, "Amount > 0");
        uint256 currentTokenBalance = deposits[msg.sender][token];
        require(wad <= currentTokenBalance, "Insufficient balance");
        uint256 depositsDaiValue = _calculateTotalDepositsDaiValue(msg.sender);
        (uint256 rate, uint8 decimals) = _getExchangeRate(token);
        uint256 withdrawDaiValue;
        unchecked {
            withdrawDaiValue = (wad * 10**decimals) / rate;
        }
        require((depositsDaiValue - loans[msg.sender]) >= withdrawDaiValue, "Insufficient collateral");
        unchecked {
            deposits[msg.sender][token] = currentTokenBalance - wad;
        }
        TransferHelper.safeTransferFrom(IERC20(token), address(this), msg.sender, wad);
        emit Withdraw(token, wad);
    }

    //@notice Function used to total all deposits for a user converted to Dai
    //@param guy The user for whom the deposits are being totaled
    function _calculateTotalDepositsDaiValue(address guy) internal view returns (uint256 daiTotal) {
        address[] memory tokensDeposited_ = tokensDeposited[guy];
        for (uint256 idx = 0; idx < tokensDeposited_.length; idx++) {
            address token = address(tokensDeposited_[idx]);
            uint256 currentTokenDeposit = deposits[guy][token];
            if (currentTokenDeposit > 0) {
                uint256 currentTokenDaiValue;
                (uint256 rate, uint8 decimals) = _getExchangeRate(token);
                currentTokenDaiValue = (currentTokenDeposit * 10**decimals) / rate;
                daiTotal = daiTotal + currentTokenDaiValue;
            }
        }
    }

    //@notice Function used to borrow Dai collateralized by token deposits
    //@param daiWad amount of loan in Dai
    function borrow(uint256 daiWad) external {
        require(daiWad > 0, "Amount > 0 required");
        uint256 depositsDaiValue = _calculateTotalDepositsDaiValue(msg.sender);
        require((loans[msg.sender] + daiWad) <= depositsDaiValue, "Insufficient collateral");
        unchecked {
            loans[msg.sender] += daiWad;
        }
        TransferHelper.safeTransfer(daiToken, msg.sender, daiWad);
        emit Borrow(daiWad);
    }

    //@notice Function used to pay down Dai loans
    //@param daiWad Amount to repay in Dai
    function repay(uint256 daiWad) external {
        require(daiWad > 0 && (daiWad <= loans[msg.sender]), "Invalid amount");
        unchecked {
            loans[msg.sender] -= daiWad;
        }
        TransferHelper.safeTransferFrom(daiToken, address(this), msg.sender, daiWad);
        emit Repay(daiWad);
    }

    //@notice Function used to liquidate
    //@param guy User to liquidate
    function liquidate(address guy) external {
        require(msg.sender == owner, "Unauthorized");
        uint256 depositsDaiValue = _calculateTotalDepositsDaiValue(guy);
        uint256 loanDai = loans[guy];
        require(loanDai > depositsDaiValue, "Loan safe");
        delete loans[guy];
        address[] memory tokensDeposited_ = tokensDeposited[guy];
        for (uint256 idx = 0; idx < tokensDeposited_.length; idx++) {
            address token = tokensDeposited_[idx];
            delete deposits[guy][token];
        }
        delete tokensDeposited[guy];
        emit Liquidate(guy, loanDai);
    }

    //@notice Function used to add an accepted token
    //@dev Also fetch the decimals and cache them with feed address
    //@param token Token to add
    //@param feed Price Aggregator contract address
    function setAcceptedToken(address token, address feed) external {
        require(msg.sender == owner, "Unauthorized");
        tokensAcceptedMapping[token] = true;
        uint8 decimals = AggregatorV3Interface(feed).decimals();
        priceFeeds[token] = PriceFeed(feed, decimals);
        emit SetAcceptedToken(token, feed);
    }
}

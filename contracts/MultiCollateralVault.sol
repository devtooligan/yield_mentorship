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
    address public daiToken;
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
    event AddAcceptedToken(address indexed token);

    // @dev Deploy with address of Dai Stablecoin token
    constructor(address _daiToken) {
        owner = msg.sender;
        daiToken = _daiToken;
    }

    //@notice Function used to get latest Dai/token exchange from price feed
    //@dev For simplicity, we are using usd exchange rates instead of dai
    //@param _token ERC20 token address to get rate for
    function _getExchangeRate(address _token) internal view returns (uint256 rate, uint8 decimals) {
        require(tokensAcceptedMapping[_token], "Invalid token");
        PriceFeed memory feedData = priceFeeds[_token];
        (, int256 answer, , , ) = AggregatorV3Interface(feedData.feed).latestRoundData();
        require(answer > 0, "Invalid data");
        rate = uint256(answer);
        decimals = uint8(feedData.decimals);
    }

    //@notice Function used to update the list of tokensDeposited for each user
    //@dev We are intentionally not removing tokens from this list when balances drop to zero
    //@dev because its deemed not worth the extra code and gas
    //@param _guy User address to update
    //@param _token ERC20 token address to add
    function _updateTokensDeposited(address _guy, address _token) internal {
        bool hasToken = false;
        address[] memory tokensDepositedMem = tokensDeposited[_guy];
        for (uint256 idx = 0; idx < tokensDepositedMem.length; idx++) {
            if (tokensDepositedMem[idx] == _token) {
                hasToken = true;
                break;
            }
        }
        if (!hasToken) {
            tokensDeposited[_guy].push(_token);
        }
    }

    //@notice Function used to deposit ERC20 tokens
    //@param _token ERC20 token address
    //@param _wad Amount of token to deposit
    function deposit(address _token, uint256 _wad) external {
        require(tokensAcceptedMapping[_token], "Invalid token");
        require(_wad > 0, "Amount > 0 required");
        deposits[msg.sender][_token] = deposits[msg.sender][_token] + _wad;
        _updateTokensDeposited(msg.sender, _token);
        TransferHelper.safeTransferFrom(IERC20(_token), msg.sender, address(this), _wad);
        emit Deposit(_token, _wad);
    }

    //@notice Function used to withdraw ERC20 tokens
    //@param _token Token depositing
    //@param _wad Amount of token to deposit
    function withdraw(address _token, uint256 _wad) external {
        require(tokensAcceptedMapping[_token], "Invalid token");
        require(_wad > 0, "Amount > 0 required");
        uint256 oldBalance = deposits[msg.sender][_token];
        (uint256 rate, uint8 decimals) = _getExchangeRate(_token);
        uint256 oldBalanceDaiValue = (oldBalance * 10**decimals) / rate;
        uint256 withdrawDaiValue = (_wad * 10**decimals) / rate;
        require((oldBalanceDaiValue - loans[msg.sender]) >= withdrawDaiValue, "Insufficient balance");
        deposits[msg.sender][_token] = oldBalance - _wad;
        TransferHelper.safeTransferFrom(IERC20(_token), address(this), msg.sender, _wad);
        emit Withdraw(_token, _wad);
    }

    //@notice Function used to total all deposits for a user converted to Dai
    //@param guy The user for whom the deposits are being totaled
    function _calculateTotalDepositsDaiValue(address _guy) internal view returns (uint256 daiTotal) {
        address[] memory tokensDepositedMem = tokensDeposited[_guy];
        for (uint256 idx = 0; idx < tokensDepositedMem.length; idx++) {
            address token = tokensDepositedMem[idx];
            uint256 currentTokenDeposit = deposits[_guy][token];
            if (currentTokenDeposit > 0) {
                uint256 currentTokenDaiValue;
                (uint256 rate, uint8 decimals) = _getExchangeRate(token);
                currentTokenDaiValue = (currentTokenDeposit * 10**decimals) / rate;
                daiTotal = daiTotal + currentTokenDaiValue;
            }
        }
    }

    //@notice Function used to borrow Dai collateralized by token deposits
    //@param _daiWad amount of loan in Dai
    function borrow(uint256 _daiWad) external {
        require(_daiWad > 0, "Amount > 0 required");
        uint256 depositsDaiValue = _calculateTotalDepositsDaiValue(msg.sender);
        require((loans[msg.sender] + _daiWad) <= depositsDaiValue, "Insufficient collateral");
        loans[msg.sender] += _daiWad;
        TransferHelper.safeTransfer(IERC20(daiToken), msg.sender, _daiWad);
        emit Borrow(_daiWad);
    }

    //@notice Function used to pay down Dai loans
    //@param _daiWad Amount to repay in Dai
    function repay(uint256 _daiWad) external {
        require(_daiWad > 0 && (_daiWad <= loans[msg.sender]), "Invalid amount");
        unchecked {
            loans[msg.sender] -= _daiWad;
        }
        TransferHelper.safeTransferFrom(IERC20(daiToken), address(this), msg.sender, _daiWad);
        emit Repay(_daiWad);
    }

    //@notice Function used to liquidate
    //@param _guy User to liquidate
    function liquidate(address _guy) external {
        require(msg.sender == owner, "Unauthorized");
        uint256 depositsDaiValue = _calculateTotalDepositsDaiValue(_guy);
        uint256 loanDai = loans[_guy];

        require(loanDai > depositsDaiValue, "Loan safe");
        delete loans[_guy];
        address[] memory tokensDepositedMem = tokensDeposited[_guy];
        for (uint256 idx = 0; idx < tokensDepositedMem.length; idx++) {
            address token = tokensDepositedMem[idx];
            delete deposits[_guy][token];
        }
        delete tokensDeposited[_guy];
        emit Liquidate(_guy, loanDai);
    }

    //@notice Function used to add an accepted token
    //@dev Also fetch the decimals and cache them with feed address
    //@param _token Token to add
    //@param _feed Price Aggregator contract address
    function addAcceptedToken(address _token, address _feed) external {
        require(msg.sender == owner, "Unauthorized");
        require(!tokensAcceptedMapping[_token], "Already added");
        tokensAcceptedMapping[_token] = true;
        uint8 decimals = AggregatorV3Interface(_feed).decimals();
        priceFeeds[_token] = PriceFeed(_feed, decimals);
        emit AddAcceptedToken(_token);
    }
}

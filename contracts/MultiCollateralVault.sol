// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@yield-protocol/utils-v2/contracts/token/TransferHelper.sol";

// @title  MultiCollateral Vault - An exercise for the Yield Mentorship program
// @notice Deposit ERC20 Tokens - Borrow Dai
contract MultiCollateralVault {
    address public owner;

    address public daiToken;
    address[] public tokensAcceptedArray; //an array of addresses of accepted ERC20 tokens used for iterations
    mapping(address => bool) public tokensAcceptedMapping; // a mapping used to quickly determine if a token is accepted
    mapping(address => AggregatorV3Interface) internal priceFeeds;
    mapping(address => mapping(address => uint256)) public deposits; // user address => token address => balance
    mapping(address => uint256) public loans; // Amounts in dai

    event Deposit(address indexed token, uint256 wad);
    event Withdraw(address indexed token, uint256 wad);
    event Borrow(uint256 wad);
    event Repay(uint256 wad);
    event Liquidate(address indexed guy, uint256 loanDaiAmt);
    event AddAcceptedToken(address indexed token);

    // @dev Deploy with address of Dai Stablecoin token and optionally intialTokens / associated aggregators
    constructor(
        address _daiToken,
        address[] memory initialTokens,
        address[] memory initialFeeds
    ) {
        require(initialTokens.length == initialFeeds.length, "Mismatched arg lengths");
        owner = msg.sender;
        daiToken = _daiToken;
        for (uint256 idx = 0; idx < initialTokens.length; idx++) {
            address token = initialTokens[idx];
            tokensAcceptedMapping[token] = true;
            priceFeeds[token] = AggregatorV3Interface(initialFeeds[idx]);
        }
        tokensAcceptedArray = initialTokens;
    }

    //@notice Function used to get latest dai/token exchange from price feed
    //@dev For simplicity, we are using usd exchange rates instead of dai
    //@param _token ERC20 token address to get rate for
    function _getExchangeRate(address _token) internal view returns (uint256) {
        require(tokensAcceptedMapping[_token], "Invalid token");
        AggregatorV3Interface feed = priceFeeds[_token];
        (, int256 answer, , , ) = feed.latestRoundData();
        uint8 decimals = feed.decimals();
        require(answer > 0 && decimals > 0, "Invalid data");
        return uint256(answer) * 1**(18 - decimals);
    }

    //@notice Function used to deposit ERC20 tokens
    //@param _token ERC20 token address
    //@param _wad amount to deposit
    function deposit(address _token, uint256 _wad) external {
        require(tokensAcceptedMapping[_token], "Invalid token");
        require(_wad > 0, "Amount > 0 required");
        deposits[msg.sender][_token] += _wad;
        TransferHelper.safeTransferFrom(IERC20(_token), msg.sender, address(this), _wad);
        emit Deposit(_token, _wad);
    }

    //@notice Function used to withdraw ERC20 tokens
    function withdraw(address _token, uint256 _wad) external {
        require(tokensAcceptedMapping[_token], "Invalid token");
        require(_wad > 0, "Amount > 0 required");
        uint256 tokenDeposit = deposits[msg.sender][_token];
        uint256 rate = _getExchangeRate(_token);
        uint256 depositDaiValue = ((tokenDeposit * 1e18) / rate);
        uint256 _withdrawDaiValue = ((_wad * 1e18) / rate);
        require((depositDaiValue - loans[msg.sender]) >= _withdrawDaiValue, "Insufficient balance");
        deposits[msg.sender][_token] = tokenDeposit - _wad;
        TransferHelper.safeTransferFrom(IERC20(_token), address(this), msg.sender, _wad);
        emit Withdraw(_token, _wad);
    }

    //@notice Function used to total all deposits for a user converted to Dai
    //@param guy The guy for whom the deposits are being totaled
    function _calculateTotalDepositsDaiValue(address guy) internal view returns (uint256 _daiWad) {
        uint256 daiTotal = 0;
        for (uint256 idx = 0; idx < tokensAcceptedArray.length; idx++) {
            address token = tokensAcceptedArray[idx];
            uint256 currentDeposit = deposits[guy][token];
            if (currentDeposit > 0) {
                uint256 daiWad;
                daiWad = (currentDeposit * 1e18) / _getExchangeRate(token);
                daiTotal = daiTotal + daiWad;
            }
        }
        return daiTotal;
    }

    //@notice Function used to borrow dai collateralized by eth deposit
    function borrow(uint256 _daiWad) external {
        require(_daiWad > 0, "Amount > 0 required");
        uint256 _depositsDaiValue = _calculateTotalDepositsDaiValue(msg.sender);
        require((loans[msg.sender] + _daiWad) <= _depositsDaiValue, "Insufficient collateral");
        loans[msg.sender] += _daiWad;
        TransferHelper.safeTransfer(IERC20(daiToken), msg.sender, _daiWad);
        emit Borrow(_daiWad);
    }

    //@notice Function used to pay down dai loans
    function repay(uint256 _daiWad) external {
        require(_daiWad > 0 && (_daiWad <= loans[msg.sender]), "Invalid amount");
        unchecked {
            loans[msg.sender] -= _daiWad;
        }
        TransferHelper.safeTransferFrom(IERC20(daiToken), address(this), msg.sender, _daiWad);
        emit Repay(_daiWad);
    }

    //@notice Function used to liquidate
    function liquidate(address guy) external {
        require(msg.sender == owner, "Unauthorized");
        uint256 _depositsDaiValue = _calculateTotalDepositsDaiValue(guy);
        uint256 _loanDai = loans[guy];
        require(_loanDai > _depositsDaiValue, "Loan safe");
        delete loans[guy];
        for (uint256 idx = 0; idx < tokensAcceptedArray.length; idx++) {
            address token = tokensAcceptedArray[idx];
            delete deposits[guy][token];
        }
        emit Liquidate(guy, _loanDai);
    }

    //@notice Function used to add an accepted token
    function addAcceptedToken(address _token) external {
        require(msg.sender == owner, "Unauthorized");
        require(address(IERC20(_token)) == _token, "Not ERC20");
        tokensAcceptedArray.push(_token);
        tokensAcceptedMapping[_token] = true;
        emit AddAcceptedToken(_token);
    }
}

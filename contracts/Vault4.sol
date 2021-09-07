// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "./Dai.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

// @title  Collateralized Vault
// @notice Deposit Eth - Borrow Dai - Repay Dai - Withdraw Eth
contract Vault4 {
    Dai public token;
    AggregatorV3Interface internal priceFeed;

    address public owner;

    mapping(address => uint256) public deposits; // Stored in eth
    mapping(address => uint256) public loans; // Stored in dai

    //@notice The eth/dai exchange rate from oracle
    uint256 public exchangeRate;

    event Deposit(uint256 wad);
    event Withdraw(uint256 wad);
    event Borrow(uint256 wad);
    event Repay(uint256 wad);
    event Liquidate(address guy, uint256 loanDaiAmt, uint256 depositEthAmt);

    // @dev Deploy with address of Dai Stablecoin token
    constructor(Dai _token, address _oracleAddress) {
        token = _token;
        owner = msg.sender;
        priceFeed = AggregatorV3Interface(_oracleAddress);
    }

    //@notice Function used to get dai/eth exchange from price feed and convert eth to dai
    //@param wad amount to apply exchange rate to
    //@param update If true, will fetch exchange rate from oracle
    function applyExchangeRate(uint256 _ethValue) internal view returns (uint256 _resultDai) {
        (, int256 answer, , , ) = priceFeed.latestRoundData();
        require(answer > 0, "Amount > 0 required");
        uint256 _currentRate = uint256(answer);
        _resultDai = _ethValue * _currentRate;
        require(_resultDai / _currentRate == _ethValue, "Overflow");
        return _resultDai;
    }

    //@notice Function used to deposit eth
    function deposit() external payable {
        require(msg.value > 0, "Amount > 0 required");
        deposits[msg.sender] += msg.value;
        emit Deposit(msg.value);
    }

    //@notice Function used to withdraw eth
    function withdraw(uint256 _ethWad) external {
        require(_ethWad > 0, "Amount > 0 required");
        uint256 _deposit = deposits[msg.sender];
        require(_deposit > 0, "Insufficient balance");
        uint256 _depositDaiValue = applyExchangeRate(_deposit);
        uint256 _withdrawDaiValue = applyExchangeRate(_ethWad);
        require((_depositDaiValue - loans[msg.sender]) >= _withdrawDaiValue, "Insufficient balance");
        deposits[msg.sender] -= _ethWad;
        payable(msg.sender).transfer(_ethWad);
        emit Withdraw(_ethWad);
    }

    //@notice Function used to borrow dai collateralized by eth deposit
    function borrow(uint256 _daiWad) external {
        require(_daiWad > 0, "Amount > 0 required");
        uint256 _depositEthValue = deposits[msg.sender];
        require(_depositEthValue > 0, "Insufficient collateral1");
        uint256 _depositDaiValue = applyExchangeRate(_depositEthValue);

        require((loans[msg.sender] + _daiWad) <= _depositDaiValue, "Insufficient collateral2");
        loans[msg.sender] += _daiWad;
        token.push(msg.sender, _daiWad);
        emit Borrow(_daiWad);
    }

    //@notice Function used to pay down dai loans
    function repay(uint256 _daiWad) external {
        require(_daiWad > 0, "Amount > 0 required");
        require(_daiWad <= loans[msg.sender], "Amount > loaned");
        loans[msg.sender] -= _daiWad;
        token.pull(msg.sender, _daiWad);
        emit Repay(_daiWad);
    }

    //@notice Function used to liquidate
    function liquidate(address guy) external {
        uint256 _depositEth = deposits[guy];
        require(_depositEth > 0, "No deposit");
        uint256 _loanDai = loans[guy];
        require(_loanDai > 0, "No loan");
        uint256 _depositDaiValue = applyExchangeRate(_depositEth);
        require(_loanDai > _depositDaiValue, "Loan safe");
        delete loans[guy];
        delete deposits[guy];
        emit Liquidate(guy, _loanDai, _depositEth);
    }
}

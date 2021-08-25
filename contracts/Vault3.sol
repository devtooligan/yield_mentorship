// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@yield-protocol/utils-v2/contracts/token/ERC20.sol";
import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";

// @title Vault3
// @dev Standard vault for single ERC-20 token type - part of an excercise for the Yield mentorship
//  Issues TooliganVaultToken ERC20 tokens for deposits
contract Vault3 is ERC20("TooliganVaultToken", "TVT", 18) {
    //@notice This vault only accepts one type of token which is passed in at deploy
    IERC20 public _token;

    //@notice Only the account that deployed this contract can setExchangeRate
    address public _owner;

    //@notice The exchange rate that will be used for deposits/withdrawls
    uint256 public _exchangeRate;

    event Deposit(uint256 wad);
    event Withdraw(uint256 wad);
    event SetExchangeRate(uint256 wad);

    constructor(IERC20 token, uint256 exchangeRate) {
        _token = token;
        _owner = msg.sender;
        setExchangeRate(exchangeRate);
    }

    //@notice Function used to calculate exchange amount based on the _exchangeRate
    //@param wad New rate
    function _applyExchangeRate(uint256 wad) private view returns (uint256 result) {
        result = wad * _exchangeRate;
        require(result / _exchangeRate == wad, "Overflow");
        return result / 1e18;
    }

    //@notice Function to set the exchange rate.  Simulates getting exchange rate from an oracle
    //@param wad New rate
    function setExchangeRate(uint256 wad) public {
        require(msg.sender == _owner, "Unauthorized");
        require(wad > 0, "Rate must be > 0");
        _exchangeRate = wad;
        emit SetExchangeRate(wad);
    }

    // @notice Function to deposit funds into the vault by means of
    //  transfering in tokens and minting TVT to the depositor with
    //  the exchange rate applied
    // @param wad Amount being deposited
    function deposit(uint256 wad) external {
        require(wad > 0, "Amount must be > 0");
        _mint(msg.sender, _applyExchangeRate(wad));
        _token.transferFrom(msg.sender, address(this), wad);
        emit Deposit(wad);
    }

    // @notice Function to withdraw funds from the vault by means of
    //  transfering in TVT tokens (with the exchange rate applied) and
    //  burning them, then transferring out the ERC20 tokens
    // @param wad Amount being withdrawn
    function withdraw(uint256 wad) external {
        require(wad > 0, "Amount must be > 0");
        _burn(msg.sender, _applyExchangeRate(wad));
        _token.approve(msg.sender, wad);
        _token.transfer(msg.sender, wad);
        emit Withdraw(wad);
    }
}

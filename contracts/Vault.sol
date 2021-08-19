// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "yield-utils-v2/contracts/token/IERC20.sol";

// @title Vault
// @dev Standard vault for single ERC-20 token type - part of an excercise for the Yield mentorship
contract Vault {
    //@notice This vault only accepts one type of token which is passed in at deploy
    IERC20 private _token;

    mapping(address => uint256) public balances;
    // Is there any security risk by making this public? I guess they'd see it on chain anyway

    event Deposit(uint256 amount);
    event Withdraw(uint256 amount);

    constructor(IERC20 token) {
        _token = token;
    }

    function deposit(uint256 amount) external {
        balances[msg.sender] += amount;
        _token.transferFrom(msg.sender, address(this), amount);
        emit Deposit(amount);
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficent balance");
        balances[msg.sender] -= amount;
        _token.transfer(msg.sender, amount);
        emit Withdraw(amount);
    }
}

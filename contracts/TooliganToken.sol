// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "yield-utils-v2/contracts/token/ERC20.sol";

/**
    @title TooliganToken
    @dev Standard ERC20 token as part of an excercise for the Yield mentorship
 */
contract TooliganToken is ERC20("TooliganToken", "TOOLIE", 18) {
    function mint(address dst, uint256 wad) public virtual returns (bool) {
        return _mint(dst, wad);
    }
}

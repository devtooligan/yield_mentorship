// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";

struct TokenData {
    IERC20 token;
    uint256 reserve;
}

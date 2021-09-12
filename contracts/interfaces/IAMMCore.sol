// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";
import "../types/TokenData.sol";

/**
 * @dev Interface for AMMCore
 */
interface IAMMCore is IERC20 {
    function getX() external view returns (TokenData memory);

    function getY() external view returns (TokenData memory);

    event Initialized(uint256 k);
    event Minted(address indexed guy, uint256 k);
    event Burned(address indexed guy, uint256 wad, uint256 xTokensToSend, uint256 yTokensToSend);
    event Swapped(address indexed guy, address indexed tokenIn, uint256 amountX, uint256 amountY);

    //@notice Initializes liquidity pools and k
    // @notice Use this function to initialize k and add liquidity
    // @dev Can only be used once
    // @param wadX The amount of tokenX to add
    // @param wadY The amount of tokenY to add
    function init(uint256 wadX, uint256 wadY) external;

    //@notice Initializes liquidity pools / k ratio
    //@param admin - who will get the initial lp's
    //@dev This should be called by the router contract
    function mintLP(address guy) external;

    //@notice Used to burn Lp's and get out original tokens
    //@param admin - who will get the initial lp's
    //@dev This should be called by the router contract
    function burnLP(address guy, uint256 wad) external;

    //@notice Used to sell a fixed amount of tokenX for a computed amount of Y
    //@notice This assumes the transfer in of tokenX has already occurred
    //@param address - The address of the seller / where to send the Y tokens
    //@dev This should be called by the router contract
    function swapX(address guy) external;

    //@notice Used to sell a fixed amount of tokenY for a computed amount of X
    //@notice This assumes the transfer in of tokenY has already occurred
    //@param address - The address of the seller / where to send the X tokens
    //@dev This should be called by the router contract
    function swapY(address guy) external;
}

// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";
import "../interfaces/IAMMCore.sol";

/// @title AMMRouter
/// @author devtooligan.eth
/// @notice Simple Automated Market Maker - Router contract. An excercise for the Yield mentorship program
/// @dev Uses AMMCore
contract AMMRouter {
    IAMMCore public core;
    IERC20 public xToken;
    IERC20 public yToken;

    address public owner;

    constructor(
        IAMMCore _core,
        address _xToken,
        address _yToken
    ) {
        owner = msg.sender;
        core = _core;
        xToken = IERC20(_xToken);
        yToken = IERC20(_yToken);
    }

    // @notice Use this function to add liquidity in the correct ratio, receive LP tokens
    // @param wadX The amount of tokenX to add
    // @param wadY The amount of tokenY to add
    function mint(uint256 wadX, uint256 wadY) external {
        require(wadX > 0 && wadY > 0, "Invalid amounts");
        xToken.transferFrom(msg.sender, address(core), wadX);
        yToken.transferFrom(msg.sender, address(core), wadY);
        core.mintLP(msg.sender);
    }

    // @notice Use this function to remove liquidity and get back tokens
    // @param wad The amount of LP tokens to burn
    function burn(uint256 wad) external {
        require(wad > 0, "Invalid amount");
        require(core.balanceOf(msg.sender) >= wad, "Insufficent balance");
        core.burnLP(msg.sender, wad);
    }

    // @notice Use this function to sell an exact amount of tokenX for the going rate of tokenY
    // @param wad The amount of tokenX to sell
    function sellX(uint256 wad) external {
        require(wad > 0, "Invalid amount");
        xToken.transferFrom(msg.sender, address(core), wad);
        core.swapX(msg.sender);
    }

    // @notice Use this function to sell an exact amount of tokenY for the going rate of tokenX
    // @param wad The amount of tokenY to sell
    function sellY(uint256 wad) external {
        require(wad > 0, "Invalid amount");
        yToken.transferFrom(msg.sender, address(core), wad);
        core.swapY(msg.sender);
    }
}

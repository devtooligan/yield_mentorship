// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@yield-protocol/utils-v2/contracts/token/ERC20.sol";
import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";
import "@yield-protocol/utils-v2/contracts/token/TransferHelper.sol";

import "../interfaces/IAMMCore.sol";

struct Reserve {
    uint128 x;
    uint128 y;
}

/// @title AMMRouter
/// @author devtooligan.eth
/// @notice Simple Automated Market Maker - Core logic contract. An excercise for the Yield mentorship program
/// @dev For use with AMMRouter
contract AMMCore is ERC20("TooliganLP", "TLP", 18), IAMMCore {
    address public owner;

    Reserve public reserve;

    IERC20 public tokenX;
    IERC20 public tokenY;

    //@notice Initialized with contracts of two tokens in pair
    constructor(IERC20 _tokenX, IERC20 _tokenY) {
        tokenX = _tokenX;
        tokenY = _tokenY;
        owner = msg.sender;
    }

    //@notice Initializes liquidity pools and k
    // @notice Use this function to initialize k and add liquidity
    // @dev Can only be used once
    // @param wadX The amount of tokenX to add
    // @param wadY The amount of tokenY to add
    function init(uint256 wadX, uint256 wadY) external override {
        require(wadX > 0 && wadY > 0, "Invalid amounts");
        require(msg.sender == owner, "Unauthorized");
        Reserve memory reserveMem = reserve;
        require(reserveMem.x == 0 && reserveMem.y == 0, "Previously initialized");

        IERC20 x = tokenX;
        IERC20 y = tokenY;
        TransferHelper.safeTransferFrom(x, owner, address(this), wadX);
        TransferHelper.safeTransferFrom(y, owner, address(this), wadY);

        reserve = Reserve(uint128(wadX), uint128(wadY));

        uint256 newK = (wadX * wadY) / 1e18;

        _mint(owner, newK);

        emit Initialized(newK);
    }

    //@notice Initializes liquidity pools / k ratio
    //@param admin - who will get the initial lp's
    //@dev This should be called by the router contract
    function mintLP(address guy) external override {
        Reserve memory reserveMem = reserve;
        uint256 oldReserveX = uint256(reserveMem.x);
        uint256 oldReserveY = uint256(reserveMem.y);
        require(oldReserveX > 0 && oldReserveY > 0, "Not initialized");

        uint256 newReserveX = tokenX.balanceOf(address(this));
        uint256 newReserveY = tokenY.balanceOf(address(this));
        uint256 addedX = newReserveX - oldReserveX;
        uint256 addedY = newReserveY - oldReserveY;
        require(((oldReserveX * 1e18) / oldReserveY) == ((addedX * 1e18) / addedY), "Invalid amounts");
        uint256 mintAmount = (addedX * _totalSupply) / oldReserveX;

        reserve.x = uint128(newReserveX);
        reserve.y = uint128(newReserveY);
        _mint(guy, mintAmount);

        emit Minted(guy, mintAmount);
    }

    //@notice Used to burn Lp's and get out original tokens
    //@param admin - who will get the initial lp's
    //@dev This should be called by the router contract
    function burnLP(address guy, uint256 wad) external override {
        Reserve memory reserveMem = reserve;
        uint256 oldReserveX = reserveMem.x << 128;
        uint256 oldReserveY = reserveMem.x << 128;
        require(oldReserveX > 0 && oldReserveY > 0, "Not initialized");

        uint256 burnRatio = (wad * 1e18) / _totalSupply;
        uint256 tokenXToSend = burnRatio * oldReserveX;
        uint256 tokenYToSend = burnRatio * oldReserveY;
        uint256 newReserveX = oldReserveX - tokenXToSend;
        uint256 newReserveY = oldReserveY - tokenYToSend;

        reserve.x = uint128(newReserveX);
        reserve.y = uint128(newReserveY);
        _burn(guy, wad);
        TransferHelper.safeTransfer(tokenX, guy, tokenXToSend);
        TransferHelper.safeTransfer(tokenY, guy, tokenYToSend);

        emit Burned(guy, wad, tokenXToSend, tokenYToSend);
    }

    //@notice Used to sell a fixed amount of tokenX for a computed amount of Y
    //@notice This assumes the transfer in of tokenX has already occurred
    //@param address - The address of the seller / where to send the Y tokens
    //@dev This should be called by the router contract
    function swapX(address guy) external override {
        Reserve memory reserveMem = reserve;
        uint256 oldReserveX = uint256(reserveMem.x);
        uint256 oldReserveY = uint256(reserveMem.y);
        uint256 oldK = (oldReserveX * oldReserveY) / 1e18;
        require(oldK > 0, "Not initialized");

        IERC20 x = tokenX;
        uint256 amountXIn = x.balanceOf(address(this)) - oldReserveX;
        uint256 newReserveX = oldReserveX + amountXIn;
        uint256 newReserveY = (oldK * 1e18) / newReserveX;
        uint256 amountYOut = oldReserveY - newReserveY;

        reserve.x = uint128(newReserveX);
        reserve.y = uint128(newReserveY);
        TransferHelper.safeTransfer(tokenY, guy, amountYOut);

        emit Swapped(guy, address(x), amountXIn, amountYOut);
    }

    //@notice Used to sell a fixed amount of tokenY for a computed amount of X
    //@notice This assumes the transfer in of tokenY has already occurred
    //@param address - The address of the seller / where to send the X tokens
    //@dev This should be called by the router contract
    function swapY(address guy) external override {
        Reserve memory reserveMem = reserve;
        uint256 oldReserveX = uint256(reserveMem.x);
        uint256 oldReserveY = uint256(reserveMem.y);
        uint256 oldK = (oldReserveX * oldReserveY) / 1e18;
        require(oldK > 0, "Not initialized");

        IERC20 y = tokenY;
        uint256 amountYIn = y.balanceOf(address(this)) - oldReserveY;
        uint256 newReserveY = oldReserveY + amountYIn;
        uint256 newReserveX = (oldK * 1e18) / newReserveY;
        uint256 amountXOut = oldReserveX - newReserveX;

        reserve.x = uint128(newReserveX);
        reserve.y = uint128(newReserveY);
        TransferHelper.safeTransfer(tokenX, guy, amountXOut);

        emit Swapped(guy, address(y), amountYIn, amountXOut);
    }
}

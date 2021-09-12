// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@yield-protocol/utils-v2/contracts/token/ERC20.sol";
import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";
import "@yield-protocol/utils-v2/contracts/token/TransferHelper.sol";

import "../interfaces/IAMMCore.sol";
import "../types/TokenData.sol";

/// @title AMMRouter
/// @author devtooligan.eth
/// @notice Simple Automated Market Maker - Core logic contract. An excercise for the Yield mentorship program
/// @dev For use with AMMRouter
contract AMMCore is ERC20("TooliganLP", "TLP", 18), IAMMCore {
    address public owner;
    TokenData internal x;
    TokenData internal y;
    uint256 public k; // x.reserve * y.reserve == k

    //@notice Initialized with contracts of two tokens in pair
    constructor(IERC20 _xToken, IERC20 _yToken) {
        x = TokenData(_xToken, 0);
        y = TokenData(_yToken, 0);
        owner = msg.sender;
    }

    function getX() external view override returns (TokenData memory) {
        return x;
    }

    function getY() external view override returns (TokenData memory) {
        return y;
    }

    //@notice Initializes liquidity pools and k
    // @notice Use this function to initialize k and add liquidity
    // @dev Can only be used once
    // @param wadX The amount of tokenX to add
    // @param wadY The amount of tokenY to add
    function init(uint256 wadX, uint256 wadY) external override {
        require(msg.sender == owner, "Unauthorized");
        require(k == 0, "Previously initialized");
        require(wadX > 0 && wadY > 0, "Invalid amounts");

        IERC20 xToken = x.token;
        IERC20 yToken = y.token;
        TransferHelper.safeTransferFrom(xToken, address(this), owner, wadX);
        TransferHelper.safeTransferFrom(yToken, address(this), owner, wadY);
        uint256 xBalance = xToken.balanceOf(address(this));
        uint256 yBalance = yToken.balanceOf(address(this));

        x.reserve = xBalance;
        y.reserve = yBalance;
        uint256 kValue = (xBalance * yBalance) / 1e18;
        k = kValue;

        _mint(owner, kValue);

        emit Initialized(kValue);
    }

    //@notice Initializes liquidity pools / k ratio
    //@param admin - who will get the initial lp's
    //@dev This should be called by the router contract
    function mintLP(address guy) external override {
        uint256 kValue = k;
        require(kValue > 0, "Not initialized");
        uint256 newXreserve = x.token.balanceOf(address(this));
        uint256 newYreserve = y.token.balanceOf(address(this));
        uint256 addedX = newXreserve - x.reserve;
        uint256 mintAmount = (addedX * kValue) / x.reserve;

        x.reserve = newXreserve;
        y.reserve = newYreserve;
        k = (x.reserve * y.reserve) / 1e18;

        _mint(guy, mintAmount);

        emit Minted(guy, mintAmount);
    }

    //@notice Used to burn Lp's and get out original tokens
    //@param admin - who will get the initial lp's
    //@dev This should be called by the router contract
    function burnLP(address guy, uint256 wad) external override {
        uint256 xReserve = x.reserve;
        uint256 yReserve = y.reserve;
        require(xReserve > 0 && yReserve > 0, "Not initialized");
        uint256 burnRatio = (wad * 1e18) / _totalSupply;
        uint256 xTokensToSend = burnRatio * xReserve;
        uint256 yTokensToSend = burnRatio * yReserve;

        x.reserve = xReserve - xTokensToSend;
        y.reserve = yReserve - yTokensToSend;
        k = (x.reserve * y.reserve) / 1e18;
        _burn(guy, wad);
        TransferHelper.safeTransfer(x.token, guy, xTokensToSend);
        TransferHelper.safeTransfer(y.token, guy, yTokensToSend);

        emit Burned(guy, wad, xTokensToSend, yTokensToSend);
    }

    //@notice Used to sell a fixed amount of tokenX for a computed amount of Y
    //@notice This assumes the transfer in of tokenX has already occurred
    //@param address - The address of the seller / where to send the Y tokens
    //@dev This should be called by the router contract
    function swapX(address guy) external override {
        uint256 kValue = k;
        require(kValue > 0, "Not initialized");
        TokenData memory xData = x;
        TokenData memory yData = y;

        uint256 amountXIn = xData.token.balanceOf(address(this)) - xData.reserve;
        uint256 newXreserve = xData.reserve + amountXIn;
        uint256 newYreserve = (kValue * 1e18) / newXreserve;
        uint256 amountYOut = yData.reserve - newYreserve;

        x.reserve = newXreserve;
        y.reserve = newYreserve;
        TransferHelper.safeTransfer(yData.token, guy, amountYOut);

        emit Swapped(guy, address(xData.token), amountXIn, amountYOut);
    }

    //@notice Used to sell a fixed amount of tokenY for a computed amount of X
    //@notice This assumes the transfer in of tokenY has already occurred
    //@param address - The address of the seller / where to send the X tokens
    //@dev This should be called by the router contract
    function swapY(address guy) external override {
        uint256 kValue = k;
        require(kValue > 0, "Not intitialized");
        TokenData memory xData = x;
        TokenData memory yData = y;
        uint256 amountYIn = yData.token.balanceOf(address(this)) - yData.reserve;
        uint256 newYreserve = yData.reserve + amountYIn;
        uint256 newXreserve = (kValue * 1e18) / newYreserve;
        uint256 amountXOut = xData.reserve - newXreserve;

        x.reserve = newXreserve;
        y.reserve = newYreserve;
        TransferHelper.safeTransfer(xData.token, guy, amountXOut);

        emit Swapped(guy, address(yData.token), amountYIn, amountXOut);
    }
}

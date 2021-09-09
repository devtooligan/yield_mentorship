// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@yield-protocol/utils-v2/contracts/token/ERC20.sol";
import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";

/// @title AMMRouter
/// @author devtooligan.eth
/// @notice Simple Automated Market Maker - Core logic contract. An excercise for the Yield mentorship program
/// @dev For use with AMMRouter
contract AMMCore is ERC20("TooliganLP", "TLP", 18) {
    address public owner;

    struct TokenData {
        IERC20 token;
        uint256 reserve;
    }

    TokenData public x;
    TokenData public y;
    uint256 public k; // x.reserve * y.reserve == k

    event Initialized(uint256 k);
    event Minted(address guy, uint256 k);
    event Burned(address guy, uint256 wad, uint256 xTokensToSend, uint256 yTokensToSend);
    event Swapped(address guy, address tokenIn, uint256 amountX, uint256 amountY);

    modifier isInitialized() {
        require(k > 0, "Not initialized");
        _;
    }

    modifier isOwner() {
        require(msg.sender == owner, "Unauthorized");
        _;
    }

    //@notice Initialized with contracts of two tokens in pair
    constructor(IERC20 _xToken, IERC20 _yToken) {
        owner = msg.sender;
        x = TokenData(_xToken, 0);
        y = TokenData(_yToken, 0);
    }

    //@notice Sets owner of contract.  This should be used to set the Router as owner after deploy
    //@param owner - address of owner
    //@dev This should be called by the router contract
    function setOwner(address _owner) public isOwner {
        owner = _owner;
    }

    //@notice Initializes liquidity pools / k ratio
    //@param admin - who will get the initial lp's
    //@dev This should be called by the router contract
    function _init(address admin) external isOwner {
        require(k == 0, "Previously initialized");
        x.reserve = x.token.balanceOf(address(this));
        y.reserve = y.token.balanceOf(address(this));
        k = (x.reserve * y.reserve) / 1e18;

        _mint(admin, k);

        emit Initialized(k);
    }

    //@notice Initializes liquidity pools / k ratio
    //@param admin - who will get the initial lp's
    //@dev This should be called by the router contract
    function _mintLP(address guy) external isInitialized isOwner {
        uint256 newXreserve = x.token.balanceOf(address(this));
        uint256 newYreserve = y.token.balanceOf(address(this));
        uint256 added0 = newXreserve - x.reserve;
        uint256 mintAmount = (((added0 * 1e18) / x.reserve) * k) / 1e18;

        x.reserve = newXreserve;
        y.reserve = newYreserve;
        k = (x.reserve * y.reserve) / 1e18;

        _mint(guy, mintAmount);

        emit Minted(guy, mintAmount);
    }

    //@notice Used to burn Lp's and get out original tokens
    //@param admin - who will get the initial lp's
    //@dev This should be called by the router contract
    function _burnLP(address guy, uint256 wad) external isInitialized isOwner {
        uint256 burnRatio = (wad * 1e18) / _totalSupply;
        uint256 xTokensToSend = burnRatio * x.reserve;
        uint256 yTokensToSend = burnRatio * y.reserve;

        x.reserve -= xTokensToSend;
        y.reserve -= yTokensToSend;
        k = x.reserve * y.reserve;
        _burn(guy, wad);
        x.token.transfer(guy, xTokensToSend);
        y.token.transfer(guy, yTokensToSend);

        emit Burned(guy, wad, xTokensToSend, yTokensToSend);
    }

    //@notice Used to sell a fixed amount of tokenX for a computed amount of Y
    //@notice This assumes the transfer in of tokenX has already occurred
    //@param address - The address of the seller / where to send the Y tokens
    //@dev This should be called by the router contract
    function _swapX(address guy) external isInitialized isOwner {
        uint256 amountXIn = x.token.balanceOf(address(this)) - x.reserve;
        uint256 newXreserve = x.reserve + amountXIn;
        uint256 newYreserve = (k * 1e18) / newXreserve;
        uint256 amountYOut = y.reserve - newYreserve;

        x.reserve = newXreserve;
        y.reserve = newYreserve;
        y.token.transfer(guy, amountYOut);

        emit Swapped(guy, address(x.token), amountXIn, amountYOut);
    }

    //@notice Used to sell a fixed amount of tokenY for a computed amount of X
    //@notice This assumes the transfer in of tokenY has already occurred
    //@param address - The address of the seller / where to send the X tokens
    //@dev This should be called by the router contract
    function _swapY(address guy) external isInitialized isOwner {
        uint256 amountYIn = y.token.balanceOf(address(this)) - y.reserve;
        uint256 newYreserve = y.reserve + amountYIn;
        uint256 newXreserve = (k * 1e18) / newYreserve;
        uint256 amountXOut = x.reserve - newXreserve;

        x.reserve = newXreserve;
        y.reserve = newYreserve;
        x.token.transfer(guy, amountXOut);

        emit Swapped(guy, address(y.token), amountYIn, amountXOut);
    }
}

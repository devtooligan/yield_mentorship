// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract MockPriceFeedAggregator is AggregatorV3Interface {
    int256 public rate; // settable rate that will be returned
    uint8 public override decimals;

    constructor(int256 _rate, uint8 _decimals) {
        rate = _rate;
        decimals = _decimals;
    }

    function setRate(int256 _rate) external {
        rate = _rate;
    }

    function description() external pure override returns (string memory) {
        return "Mock Price Feed Aggregtator";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    // getRoundData and latestRoundData should both raise "No data present"
    // if they do not have data to report, instead of returning unset values
    // which could be misinterpreted as actual reported values.
    function getRoundData(uint80 _roundId)
        external
        pure
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, 1, 1, 1, 1);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, rate, 1, 1, 1);
    }
}

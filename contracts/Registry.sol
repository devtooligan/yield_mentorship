// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

contract Registry {
    mapping(string => address) public claimedNames;

    function claimName(string memory _name) public {
        require(claimedNames[_name] == address(0), "Name already claimed");
        claimedNames[_name] = msg.sender;
    }

    function releaseName(string memory _name) public {
        require(claimedNames[_name] == msg.sender, "Unauthorized");
        claimedNames[_name] = address(0);
    }
}

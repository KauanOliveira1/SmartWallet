//SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

contract Consumer{
    function getBalance() public view returns(uint){
        return address(this).balance;
    }
    function deposit() public payable {}
}

contract SmartContractWallet {

    address payable public owner;

    mapping(address => uint) public allowance;
    mapping(address => bool) public isAllowedToSend;

    mapping(address => bool) public guardians;
    mapping(address => mapping (address => bool)) nextOwnerGuardianVotedBool;
    address payable nextOwner;
    uint guardiansResetCount;
    uint public constant confirmationsFromGuardiansForReset=3;

    constructor(){
        owner = payable (msg.sender); 
    }

    function setGuardians(address _isGuardian) public {
        require(msg.sender == owner, "You are not the owner, aborting");
        guardians[_isGuardian] = true;
    }

    function proposeNewOwner(address payable  _newOwner) public{
        require(guardians[msg.sender],"You are not guardian of this wallet, aborting");
        require(nextOwnerGuardianVotedBool[_newOwner][msg.sender]==false, "You already voted, aborting");
        if(_newOwner !=  nextOwner){
            nextOwner = _newOwner;
            guardiansResetCount = 0;
        }

        guardiansResetCount++;

        if(guardiansResetCount >= confirmationsFromGuardiansForReset){
            owner = nextOwner;
            nextOwner = payable(address(0));
        }
    }

    function setAllowance(address _for, uint _amount) public {
        require(msg.sender == owner, "You are not the owner, aborting");
        allowance[msg.sender] = _amount;

        if(_amount > 0){
            isAllowedToSend[_for] = true;
        } else {
            isAllowedToSend[_for] = false;
        }
    }

    function transfer(address payable _to, uint _amount, bytes memory _payload) public returns(bytes memory){
        if(msg.sender != owner){
            require(isAllowedToSend[msg.sender], "You are not allowed to send anything from this smart contract, aborting");
            require(allowance[msg.sender] >= _amount, "You are trying to send more than you are allowed to, aborting");

            allowance[msg.sender] -= _amount;
        }

        (bool success, bytes memory returnData) = _to.call{value: _amount}(_payload);
        require(success, "Aborting, call was not successful ");
        return returnData;
    }

    receive() external payable { }
}
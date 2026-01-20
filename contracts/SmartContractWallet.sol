//SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract SmartContractWallet {

    address payable public owner;

    mapping(address => uint256) public allowance;
    mapping(address => bool) public isAllowedToSend;

    mapping(address => bool) public guardians;
    mapping(address => mapping(address => bool)) public nextOwnerGuardianVotedBool;

    address payable public nextOwner;
    uint256 public guardiansResetCount;
    uint256 public constant confirmationsFromGuardiansForReset = 3;

    constructor() {
        owner = payable(msg.sender);
    }

    function setGuardian(address guardian, bool isGuardian) external {
        require(msg.sender == owner, "You are not the owner, aborting");
        guardians[guardian] = isGuardian;
    }

    function proposeNewOwner(address payable _newOwner) external {
        require(guardians[msg.sender], "You are not guardian of this wallet, aborting");
        require(_newOwner != address(0), "New owner cannot be zero");
        
        // se mudou o candidato, reinicia contagem (e troca o "contexto" de votos)
        if (_newOwner != nextOwner) {
            nextOwner = _newOwner;
            guardiansResetCount = 0;
        }

        require(!nextOwnerGuardianVotedBool[nextOwner][msg.sender], "You already voted, aborting");
        nextOwnerGuardianVotedBool[nextOwner][msg.sender] = true; 

        guardiansResetCount++;

        if (guardiansResetCount >= confirmationsFromGuardiansForReset) {
            owner = nextOwner;
            nextOwner = payable(address(0));
            guardiansResetCount = 0;
        }
    }

    function setAllowance(address _for, uint256 _amount) external {
        require(msg.sender == owner, "You are not the owner, aborting");
        require(_for != address(0), "Invalid address");

        allowance[_for] = _amount;

        isAllowedToSend[_for] = (_amount > 0);
    }

    function transfer(address payable _to, uint256 _amount, bytes memory _payload)
        external
        returns (bytes memory)
    {
        require(_to != address(0), "Invalid recipient");

        if (msg.sender != owner) {
            require(isAllowedToSend[msg.sender], "Not allowed, aborting");
            require(allowance[msg.sender] >= _amount, "Exceeds allowance, aborting");
            allowance[msg.sender] -= _amount;
        }

        (bool success, bytes memory returnData) = _to.call{value: _amount}(_payload);
        require(success, "Call failed");
        return returnData;
    }

    receive() external payable {}
}


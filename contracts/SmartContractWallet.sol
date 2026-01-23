// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SmartContractWallet {
    // --- Core ---
    address payable public owner;
    mapping(address => uint256) public allowance;

    // --- Guardians ---
    mapping(address => bool) public guardians;

    // --- Social recovery ---
    uint256 public constant confirmationsFromGuardiansForReset = 3;
    uint256 public constant PROPOSAL_TTL = 1 days;

    uint256 public proposalId;
    address payable public proposedOwner;
    uint256 public proposalVotes;
    uint256 public proposalCreatedAt;

    // proposalId => guardian => voted?
    mapping(uint256 => mapping(address => bool)) public voted;

    // --- Reentrancy guard ---
    uint256 private _locked = 0;
    modifier nonReentrant() {
        require(_locked == 0, "Reentrancy");
        _locked = 1;
        _;
        _locked = 0;
    }

    // --- Events ---
    event Deposit(address indexed from, uint256 amount, uint256 balance);
    event GuardianSet(address indexed guardian, bool enabled);
    event AllowanceSet(address indexed spender, uint256 amount);

    event OwnerProposalOpened(
        uint256 indexed proposalId,
        address indexed proposedOwner,
        uint256 createdAt,
        uint256 expiresAt
    );

    event OwnerVote(uint256 indexed proposalId, address indexed guardian, uint256 votes);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    event Executed(
        address indexed caller,
        address indexed to,
        uint256 value,
        bytes data,
        bytes result
    );

    // --- Modifiers ---
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyGuardian() {
        require(guardians[msg.sender], "Not guardian");
        _;
    }

    constructor() {
        owner = payable(msg.sender);
    }

    // --- Proposal helpers ---
    function proposalActive() public view returns (bool) {
        if (proposedOwner == address(0)) return false;
        return block.timestamp <= proposalCreatedAt + PROPOSAL_TTL;
    }

    function proposalExpiresAt() public view returns (uint256) {
        if (proposedOwner == address(0)) return 0;
        return proposalCreatedAt + PROPOSAL_TTL;
    }

    // --- Admin ---
    function setGuardian(address guardian, bool isGuardian) external onlyOwner {
        require(guardian != address(0), "Invalid guardian");
        guardians[guardian] = isGuardian;
        emit GuardianSet(guardian, isGuardian);
    }

    function setAllowance(address spender, uint256 amount) external onlyOwner {
        require(spender != address(0), "Invalid spender");
        allowance[spender] = amount;
        emit AllowanceSet(spender, amount);
    }

    function increaseAllowance(address spender, uint256 added) external onlyOwner {
        require(spender != address(0), "Invalid spender");
        allowance[spender] += added;
        emit AllowanceSet(spender, allowance[spender]);
    }

    function decreaseAllowance(address spender, uint256 subtracted) external onlyOwner {
        require(spender != address(0), "Invalid spender");
        uint256 current = allowance[spender];
        require(current >= subtracted, "Below zero");
        unchecked {
            allowance[spender] = current - subtracted;
        }
        emit AllowanceSet(spender, allowance[spender]);
    }

    // --- Social recovery ---
    function proposeNewOwner(address payable newOwner) external onlyGuardian {
        require(newOwner != address(0), "New owner cannot be zero");

        if (!proposalActive()) {
            // abre nova proposta
            proposalId++;
            proposedOwner = newOwner;
            proposalVotes = 0;
            proposalCreatedAt = block.timestamp;

            emit OwnerProposalOpened(
                proposalId,
                proposedOwner,
                proposalCreatedAt,
                proposalCreatedAt + PROPOSAL_TTL
            );
        } else {
            // se já existe proposta ativa, não deixa trocar o candidato no meio
            require(newOwner == proposedOwner, "Active proposal locked");
        }

        require(!voted[proposalId][msg.sender], "Already voted");
        voted[proposalId][msg.sender] = true;

        proposalVotes++;
        emit OwnerVote(proposalId, msg.sender, proposalVotes);

        if (proposalVotes >= confirmationsFromGuardiansForReset) {
            address payable oldOwner = owner;
            owner = proposedOwner;

            // encerra a proposta
            proposedOwner = payable(address(0));
            proposalVotes = 0;
            proposalCreatedAt = 0;

            emit OwnerChanged(oldOwner, owner);
        }
    }

    // --- Execution ---
    function execute(address payable to, uint256 value, bytes calldata data)
        public
        nonReentrant
        returns (bytes memory)
    {
        require(to != address(0), "Invalid recipient");
        require(address(this).balance >= value, "Insufficient balance");

        // Se não for o owner, consome allowance
        if (msg.sender != owner) {
            uint256 current = allowance[msg.sender];
            require(current >= value, "Exceeds allowance");
            unchecked {
                allowance[msg.sender] = current - value;
            }
        }

        (bool ok, bytes memory result) = to.call{value: value}(data);
        require(ok, "Call failed");

        emit Executed(msg.sender, to, value, data, result);
        return result;
    }

    function transfer(address payable _to, uint256 _amount, bytes calldata _payload)
        external
        returns (bytes memory)
    {
        return execute(_to, _amount, _payload);
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }
}

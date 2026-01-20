/* eslint-disable no-undef */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SmartContractWallet", function () {
  async function deployFixture() {
    const [owner, guardian1, guardian2, guardian3, newOwner, spender, recipient] =
      await ethers.getSigners();

    const Wallet = await ethers.getContractFactory("SmartContractWallet");
    const wallet = await Wallet.deploy();
    await wallet.deployed();

    // Deposita 1 ETH na wallet
    await owner.sendTransaction({
      to: wallet.address,
      value: ethers.utils.parseEther("1.0"),
    });

    return { wallet, owner, guardian1, guardian2, guardian3, newOwner, spender, recipient };
  }

  it("owner é o deployer", async function () {
    const { wallet, owner } = await deployFixture();
    expect(await wallet.owner()).to.equal(owner.address);
  });

  it("somente owner pode setar guardian", async function () {
    const { wallet, owner, guardian1, spender } = await deployFixture();

    await expect(wallet.connect(owner).setGuardian(guardian1.address, true))
      .to.emit(wallet, "GuardianSet")
      .withArgs(guardian1.address, true);

    await expect(wallet.connect(spender).setGuardian(spender.address, true))
      .to.be.revertedWith("Not owner");
  });

  it("social recovery: 3 guardians trocam o owner e guardian nao vota 2x", async function () {
    const { wallet, owner, guardian1, guardian2, guardian3, newOwner } = await deployFixture();

    await wallet.connect(owner).setGuardian(guardian1.address, true);
    await wallet.connect(owner).setGuardian(guardian2.address, true);
    await wallet.connect(owner).setGuardian(guardian3.address, true);

    // 1o voto
    await expect(wallet.connect(guardian1).proposeNewOwner(newOwner.address))
      .to.emit(wallet, "OwnerProposed");

    // guardian1 nao pode votar novamente na mesma proposta
    await expect(wallet.connect(guardian1).proposeNewOwner(newOwner.address))
      .to.be.revertedWith("Already voted");

    // Ainda nao mudou
    expect(await wallet.owner()).to.equal(owner.address);

    // 2o voto
    await wallet.connect(guardian2).proposeNewOwner(newOwner.address);
    expect(await wallet.owner()).to.equal(owner.address);

    // 3o voto => troca owner
    await expect(wallet.connect(guardian3).proposeNewOwner(newOwner.address))
      .to.emit(wallet, "OwnerChanged");

    expect(await wallet.owner()).to.equal(newOwner.address);
  });

  it("alternar candidato cria nova proposta e permite votar de novo (proposalId)", async function () {
    const { wallet, owner, guardian1, guardian2, guardian3, newOwner } = await deployFixture();
    const altOwner = guardian2; // só pra ter outro candidato

    await wallet.connect(owner).setGuardian(guardian1.address, true);
    await wallet.connect(owner).setGuardian(guardian2.address, true);
    await wallet.connect(owner).setGuardian(guardian3.address, true);

    // Proposta A (2 votos)
    await wallet.connect(guardian1).proposeNewOwner(newOwner.address);
    await wallet.connect(guardian2).proposeNewOwner(newOwner.address);

    // Muda para candidato B => nova proposta
    await wallet.connect(guardian3).proposeNewOwner(altOwner.address);

    // Volta para candidato A => nova proposta (proposalId novo),
    // guardian1 pode votar novamente
    await expect(wallet.connect(guardian1).proposeNewOwner(newOwner.address))
      .to.emit(wallet, "OwnerProposed");
  });

  it("allowance: spender executa transferencia e allowance decrementa", async function () {
    const { wallet, owner, spender, recipient } = await deployFixture();

    const initialAllowance = ethers.utils.parseEther("0.2");
    await expect(wallet.connect(owner).setAllowance(spender.address, initialAllowance))
      .to.emit(wallet, "AllowanceSet")
      .withArgs(spender.address, initialAllowance);

    const sendValue = ethers.utils.parseEther("0.1");

    const before = await ethers.provider.getBalance(recipient.address);
    await wallet.connect(spender).execute(recipient.address, sendValue, "0x");
    const after = await ethers.provider.getBalance(recipient.address);

    expect(after.sub(before)).to.equal(sendValue);

    const remaining = await wallet.allowance(spender.address);
    expect(remaining).to.equal(ethers.utils.parseEther("0.1"));
  });

  it("spender nao pode exceder allowance", async function () {
    const { wallet, owner, spender, recipient } = await deployFixture();

    await wallet.connect(owner).setAllowance(spender.address, ethers.utils.parseEther("0.05"));

    await expect(
      wallet.connect(spender).execute(recipient.address, ethers.utils.parseEther("0.06"), "0x")
    ).to.be.revertedWith("Exceeds allowance");
  });

  it("owner pode executar sem allowance", async function () {
    const { wallet, owner, recipient } = await deployFixture();

    await expect(wallet.connect(owner).execute(recipient.address, ethers.utils.parseEther("0.1"), "0x"))
      .to.emit(wallet, "Executed");
  });
});

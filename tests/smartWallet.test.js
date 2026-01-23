/* eslint-disable no-undef */
const { expect } = require("chai");

// Detecta ambiente
const isTruffleRemix =
  typeof artifacts !== "undefined" &&
  typeof contract === "function" &&
  typeof web3 !== "undefined";

if (isTruffleRemix) {
  // --- Remix/Truffle style ---
  const Wallet = artifacts.require("SmartContractWallet");

  contract("SmartContractWallet (Remix)", (accounts) => {
    const [owner, g1, g2, g3, newOwner, spender, recipient] = accounts;

    it("owner é o deployer", async () => {
      const wallet = await Wallet.new({ from: owner });
      expect(await wallet.owner()).to.equal(owner);
    });

    it("social recovery: 3 guardians trocam o owner e guardian nao vota 2x", async () => {
      const wallet = await Wallet.new({ from: owner });

      // deposita 1 ETH
      await web3.eth.sendTransaction({ from: owner, to: wallet.address, value: web3.utils.toWei("1", "ether") });

      await wallet.setGuardian(g1, true, { from: owner });
      await wallet.setGuardian(g2, true, { from: owner });
      await wallet.setGuardian(g3, true, { from: owner });

      await wallet.proposeNewOwner(newOwner, { from: g1 });
      await expect(wallet.proposeNewOwner(newOwner, { from: g1 })).to.be.rejected;

      await wallet.proposeNewOwner(newOwner, { from: g2 });
      await wallet.proposeNewOwner(newOwner, { from: g3 });

      expect(await wallet.owner()).to.equal(newOwner);
    });

    it("spender: nao pode executar com data e nem enviar para contrato", async () => {
      const wallet = await Wallet.new({ from: owner });
      await web3.eth.sendTransaction({ from: owner, to: wallet.address, value: web3.utils.toWei("1", "ether") });

      await wallet.setAllowance(spender, web3.utils.toWei("1", "ether"), { from: owner });

      // data != vazio => bloqueia
      await expect(
        wallet.execute(recipient, web3.utils.toWei("0.1", "ether"), "0x1234", { from: spender })
      ).to.be.rejected;

      // to = contrato (wallet) => bloqueia
      await expect(
        wallet.execute(wallet.address, web3.utils.toWei("0.1", "ether"), "0x", { from: spender })
      ).to.be.rejected;
    });
  });
} else {
  // --- Hardhat style ---
  const { ethers } = require("hardhat");

  const parseEther = (v) => (ethers.utils ? ethers.utils.parseEther(v) : ethers.parseEther(v));

  async function addrOf(contract) {
    if (contract.address) return contract.address;
    if (contract.target) return contract.target;
    return await contract.getAddress();
  }

  describe("SmartContractWallet (Hardhat)", function () {
    async function deployFixture() {
      const [owner, guardian1, guardian2, guardian3, newOwner, spender, recipient] =
        await ethers.getSigners();

      const Wallet = await ethers.getContractFactory("SmartContractWallet");
      const wallet = await Wallet.deploy();
      if (wallet.waitForDeployment) await wallet.waitForDeployment();
      if (wallet.deployed) await wallet.deployed();

      const walletAddress = await addrOf(wallet);

      // Deposita 1 ETH
      await owner.sendTransaction({ to: walletAddress, value: parseEther("1.0") });

      return { wallet, walletAddress, owner, guardian1, guardian2, guardian3, newOwner, spender, recipient };
    }

    it("owner é o deployer", async function () {
      const { wallet, owner } = await deployFixture();
      expect(await wallet.owner()).to.equal(owner.address);
    });

    it("social recovery: 3 guardians trocam o owner; guardian nao vota 2x", async function () {
      const { wallet, owner, guardian1, guardian2, guardian3, newOwner } = await deployFixture();

      await wallet.connect(owner).setGuardian(guardian1.address, true);
      await wallet.connect(owner).setGuardian(guardian2.address, true);
      await wallet.connect(owner).setGuardian(guardian3.address, true);

      await wallet.connect(guardian1).proposeNewOwner(newOwner.address);
      await expect(wallet.connect(guardian1).proposeNewOwner(newOwner.address))
        .to.be.revertedWith("Already voted");

      await wallet.connect(guardian2).proposeNewOwner(newOwner.address);
      await wallet.connect(guardian3).proposeNewOwner(newOwner.address);

      expect(await wallet.owner()).to.equal(newOwner.address);
    });

    it("allowance: spender envia ETH para EOA e allowance decrementa", async function () {
      const { wallet, owner, spender, recipient } = await deployFixture();

      await wallet.connect(owner).setAllowance(spender.address, parseEther("0.2"));

      const before = await ethers.provider.getBalance(recipient.address);
      await wallet.connect(spender).execute(recipient.address, parseEther("0.1"), "0x");
      const after = await ethers.provider.getBalance(recipient.address);

      // compat v5/v6 (BigNumber vs bigint)
      const diff = after.sub ? after.sub(before) : (after - before);
      expect(diff.toString()).to.equal(parseEther("0.1").toString());

      const remaining = await wallet.allowance(spender.address);
      expect(remaining.toString()).to.equal(parseEther("0.1").toString());
    });

    it("spender: nao pode executar com data e nem enviar para contrato", async function () {
      const { wallet, walletAddress, owner, spender, recipient } = await deployFixture();

      await wallet.connect(owner).setAllowance(spender.address, parseEther("1"));

      // data != vazio => bloqueia
      await expect(
        wallet.connect(spender).execute(recipient.address, parseEther("0.01"), "0x1234")
      ).to.be.revertedWith("Spender: data not allowed");

      // to = contrato (a própria wallet) => bloqueia
      await expect(
        wallet.connect(spender).execute(walletAddress, parseEther("0.01"), "0x")
      ).to.be.revertedWith("Spender: contracts not allowed");
    });

    it("owner pode executar com data (chamada arbitrária) se quiser", async function () {
      const { wallet, owner, recipient } = await deployFixture();
      await expect(wallet.connect(owner).execute(recipient.address, parseEther("0.01"), "0x"))
        .to.emit(wallet, "Executed");
    });
  });
}

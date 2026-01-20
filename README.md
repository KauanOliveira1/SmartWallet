# Smart Contract Wallet (Guardians + Allowances)

Uma **smart wallet** simples em Solidity com:
- **Owner** (dono) que administra permissões
- **Guardians** (guardiões) que podem votar para trocar o owner
- **Allowance** (limite de gasto) para permitir que outras contas executem transações pela wallet
- Execução genérica via `call` com envio de ETH e payload arbitrário

> Projeto pensado para estudo / PoC e fácil extensão.

---

## ✅ Requisitos

- Remix IDE (Web) **ou** Remix Desktop
- Solidity `0.8.x` (o contrato usa `pragma solidity 0.8.30;`)

---

## 🚀 Como usar no Remix (passo a passo)

1. Abra o Remix:  
   - https://remix.ethereum.org

2. Crie/importe o projeto:
   - `File Explorer` → **Upload folder** / **Upload file**
   - envie o arquivo `contracts/SmartContract.sol`

3. Compile:
   - Aba **Solidity Compiler**
   - Selecione versão compatível com o `pragma` (0.8.30 ou próxima)
   - Clique em **Compile SmartContract.sol**

4. Deploy:
   - Aba **Deploy & Run Transactions**
   - Ambiente: `Remix VM` (para testes) ou `Injected Provider` (MetaMask)
   - Selecione o contrato **SmartContractWallet**
   - Clique em **Deploy**

---

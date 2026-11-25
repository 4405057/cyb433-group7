# Peer-to-Peer Insurance Registry
**CYB433 – Group 7**

## Team Members

| Role | Name | Student ID |
|---|---|---|
| P1 | Musab Alshanqiti | 4405057 |
| P2 | Malek Alaqeel | 4402724 |
| P3 | Yasser Almutairi | 4400905 |
| P4 | Mohammed Almahthawi | 4405198 |

## Smart Contract Deployment

- **Contract Name:** PeerInsuranceRegistry
- **Network:** Sepolia Testnet
- **Contract Address:** `0x8d61e5827e57840B33f53E2A9243A2827783B1C7`
- **Verification Status:** Successfully Verified

**Etherscan:**  
https://sepolia.etherscan.io/address/0x8d61e5827e57840B33f53E2A9243A2827783B1C7

## Requirements

- Node.js
- npm
- Hardhat

## Installation

Clone the repository:

```bash
git clone https://github.com/4405057/cyb433-group7.git
cd cyb433-group7
```

Install dependencies:

```bash
npm install
```

## Environment Configuration

Create a `.env` file in the project root directory.

Configure the following variables:

```env
SEPOLIA_RPC_URL=your_sepolia_rpc_url
PRIVATE_KEY=your_wallet_private_key
ETHERSCAN_API_KEY=your_etherscan_api_key
CONTRACT_ADDRESS=0x8d61e5827e57840B33f53E2A9243A2827783B1C7
```

**Security Note:** Never commit or share your `.env` file or private keys.

## How to Run

Run the test suite:

```bash
npx hardhat test
```

Run test coverage:

```bash
npx hardhat coverage
```

Deploy to Sepolia:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Verify the deployed contract:

```bash
npx hardhat verify --network sepolia YOUR_CONTRACT_ADDRESS
```

## Technologies Used

- Solidity
- Hardhat
- Ethers.js
- JavaScript
- Sepolia Testnet

## Gas Optimization

The `fileClaim` function was optimized by changing the policy variable from memory to storage.

- **Before:** 192,549 gas
- **After:** 190,323 gas
- **Gas Saved:** 2,226 gas
- **Reduction:** Approximately 1.16%
## Testing and Security Analysis

- Total Tests Passed: 28
- Statement Coverage: 92.39%
- Branch Coverage: 68.55%
- Function Coverage: 94.74%
- Line Coverage: 95.16%

## Gas Reporter Results

| Function | Average Gas |
|---|---:|
| buyPolicy | 134,212 |
| fileClaim | 189,095 |
| approveClaim | 65,333 |
| cancelPolicy | 31,485 |
| withdrawPayout | 67,668 |
| grantRole | 48,186 |

- PeerInsuranceRegistry Deployment (Gas Reporter): 1,844,000 Gas
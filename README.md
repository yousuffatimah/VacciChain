# ❄️ VacciChain: Tokenized Cold Chain Monitoring for Vaccines

Welcome to VacciChain, a revolutionary Web3 solution built on the Stacks blockchain using Clarity smart contracts! This project addresses the critical real-world problem of vaccine spoilage due to temperature fluctuations in the cold chain supply process. By integrating IoT sensors with blockchain, we ensure transparent, immutable temperature tracking, tokenized vaccine batches for ownership and compliance, and automated alerts for deviations—potentially saving lives by preventing the distribution of ineffective vaccines.

## ✨ Features

🌡️ Real-time temperature data recording from IoT sensors via oracles  
🔒 Immutable on-chain storage of temperature logs for auditability  
🛡️ Tokenized vaccine batches as NFTs for secure ownership and transfer  
🚨 Automated deviation alerts with on-chain notifications and penalties  
✅ Compliance verification and digital certificates for batches  
💰 Incentive tokens for stakeholders maintaining proper cold chain conditions  
📊 Analytics dashboard integration (off-chain) for historical data visualization  
🔄 Multi-stakeholder access: Manufacturers, distributors, and healthcare providers  

## 🛠 How It Works

**For Manufacturers**  
- Register a new vaccine batch as an NFT with initial metadata (e.g., production date, required temp range).  
- Assign registered IoT sensors to the batch.  
- Sensors periodically report temperature data through an oracle, which is logged on-chain.  

**For Distributors/Transporters**  
- Transfer batch ownership via NFT during shipping.  
- If temperature deviates from the set range (e.g., above 8°C or below 2°C for typical vaccines), the system triggers an alert, flags the batch, and applies penalties (e.g., burning incentive tokens).  

**For Healthcare Providers/Verifiers**  
- Verify batch compliance to receive a digital certificate.  
- Query historical temperature logs for any batch to ensure integrity before use.  

**Technical Flow**  
IoT sensors collect data → Oracle pushes to chain → Contracts validate and store → Alerts trigger if needed → Tokens/NFTs update status. All powered by 8 Clarity smart contracts for security and decentralization.

## 📜 Smart Contracts Overview

This project utilizes 8 interconnected Clarity smart contracts to handle various aspects of the system. Each contract is designed for modularity, security, and efficiency on the Stacks blockchain.

1. **SensorRegistry.clar**: Manages registration and authentication of IoT sensors. Handles owner assignment, sensor metadata, and revocation for faulty devices.  

2. **BatchNFT.clar**: Implements SIP-009 compliant NFTs for vaccine batches. Allows minting with metadata (e.g., batch ID, temp requirements), transfers, and status updates (e.g., "compromised").  

3. **TemperatureOracle.clar**: Receives and validates temperature data feeds from trusted oracles. Ensures data integrity with signatures and timestamps before storage.  

4. **DataLogger.clar**: Stores historical temperature logs in an immutable map. Supports querying by batch ID and time range for audits.  

5. **DeviationAlert.clar**: Monitors incoming data against batch-specific rules. Triggers on-chain events for deviations and integrates with notification systems.  

6. **IncentiveToken.clar**: SIP-010 fungible token for rewards/penalties. Stakes tokens for compliance; burns or slashes for violations to incentivize proper handling.  

7. **ComplianceVerifier.clar**: Checks batch logs against rules to issue compliance proofs. Generates verifiable certificates as on-chain data or NFTs.  

8. **StakeholderAccess.clar**: Handles user roles and permissions (e.g., manufacturer, distributor). Uses principals for access control to prevent unauthorized actions.  

These contracts interact seamlessly: For example, TemperatureOracle calls DataLogger to store data, which DeviationAlert monitors, potentially updating BatchNFT status and affecting IncentiveToken balances.

## 🚀 Getting Started

1. Install the Clarity development tools and Stacks wallet.  
2. Deploy the contracts in order (starting with SensorRegistry and BatchNFT).  
3. Integrate with IoT devices via an oracle service (e.g., custom off-chain script).  
4. Test end-to-end: Register a sensor, mint a batch NFT, simulate temp data, and verify alerts.  

Protect vaccines, build trust, and save lives—one block at a time! If you're building this, feel free to expand with off-chain UIs or more advanced oracle integrations.
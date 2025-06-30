# ETH Bumper Service

ETH Bumper is a powerful and flexible service designed to increase the transaction volume of any ERC-20 token on the Ethereum network. It achieves this by generating a series of small, automated swaps on decentralized exchanges like Uniswap, creating the appearance of organic trading activity.

This service is ideal for token owners and developers who want to:

*   **Boost Token Visibility:** Increase the trading volume to get listed on exchanges and data aggregators.
*   **Enhance Community Confidence:** A healthy trading volume can signal a strong and active project.
*   **Test Network Performance:** Simulate high transaction loads in a controlled environment.

## System Architecture

The ETH Bumper service is composed of three core components that work together to provide a seamless experience:

*   **`server.js` (The Backend):** This is the heart of the service. It's a robust Node.js application that runs on a server and manages the entire bumping process. It exposes a secure REST API, interacts with the Ethereum blockchain via `ethers.js`, and uses a MongoDB database to store all order information. The server is responsible for generating wallets, managing funds, and executing the token swaps.

*   **`sdk.js` (Software Development Kit):** The SDK is a client-side JavaScript library that provides a simple and convenient way to interact with the server's API. It abstracts away the complexity of the backend, allowing developers to easily integrate the bumping service into their own applications, bots, or scripts.

*   **`cli.js` (Command-Line Interface):** The CLI is the primary tool for end-users to interact with the ETH Bumper service. It's a client-side application that uses the SDK to send commands to the server. With the CLI, you can create new bump orders, start and monitor their progress, and check the status of all your orders—all from the comfort of your terminal.

## How to Get Started

Whether you're a token owner who wants to use the service or a developer who wants to run your own instance, here's everything you need to know.

### Prerequisites

Before you begin, make sure you have the following installed:

*   **Node.js:** [Download and install Node.js](https://nodejs.org/) (version 14 or higher).
*   **MongoDB:** [Install and run a local MongoDB server](https://docs.mongodb.com/manual/installation/).

### Server Setup (For Self-Hosting)

If you want to run your own instance of the ETH Bumper service, follow these steps:

1.  **Clone the Repository:**
    ```bash
    git clone <repository-url>
    cd eth-bumper
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Configure the Environment:**
    Create a `.env` file in the root of the project and add the following variables:

    ```
    PORT=3000
    MONGODB_URI=mongodb://localhost:27017/eth-bumper
    INFURA_PROJECT_ID=YOUR_INFURA_PROJECT_ID
    TREASURY_PRIVATE_KEY=YOUR_TREASURY_WALLET_PRIVATE_KEY
    DISPERSER_CONTRACT_ADDRESS=YOUR_DISPERSER_CONTRACT_ADDRESS
    ```

    *   `PORT`: The port on which the server will run.
    *   `MONGODB_URI`: The connection string for your MongoDB database.
    *   `INFURA_PROJECT_ID`: Your project ID from [Infura](https://infura.io/).
    *   `TREASURY_PRIVATE_KEY`: The private key of the wallet that will collect the service fees. **Never share this key or commit it to version control.**
    *   `DISPERSER_CONTRACT_ADDRESS`: The address of the deployed `Disperser.sol` contract (see next step).

4.  **Deploy the `Disperser` Contract:**
    The service uses a smart contract to efficiently distribute ETH to multiple wallets at once, saving you gas fees.

    *   Compile and deploy the `Disperser.sol` contract using a tool like [Remix](https://remix.ethereum.org/), [Hardhat](https://hardhat.org/), or [Truffle](https://www.trufflesuite.com/).
    *   Once deployed, copy the contract address and paste it into the `DISPERSER_CONTRACT_ADDRESS` variable in your `.env` file.

5.  **Start the Server:**
    ```bash
    node server.js
    ```
    Your ETH Bumper API server is now running and ready to accept requests.

### Using the Service (For Token Owners)

If the server is already hosted, you only need the client-side tools (`cli.js` and `sdk.js`) to interact with it.

#### Using the Command-Line Interface (CLI)

The CLI is the easiest way to use the service. Here are the available commands:

*   **Create a Bump Order:**
    ```bash
    node cli.js create <TOKEN_ADDRESS>
    ```
    This will create a new bump order and provide you with a deposit wallet address.

*   **Start a Bump Order:**
    After sending ETH to the deposit wallet, start the bumping process:
    ```bash
    node cli.js start <ORDER_ID>
    ```

*   **Check Order Status:**
    ```bash
    node cli.js status <ORDER_ID>
    ```

*   **Monitor Order in Real-Time:**
    ```bash
    node cli.js monitor <ORDER_ID>
    ```

*   **List All Orders:**
    ```bash
    node cli.js list
    ```

*   **Check API Health:**
    ```bash
    node cli.js health
    ```

#### Using the Software Development Kit (SDK)

For more advanced use cases, you can integrate the SDK directly into your own JavaScript projects:

```javascript
const EthBumperSDK = require('./sdk');

const sdk = new EthBumperSDK('http://localhost:3000/api'); // Replace with the actual server URL

async function main() {
    try {
        // Create a new bump order
        const order = await sdk.createBumpOrder('0x...');
        console.log('Order created:', order);

        // ... send ETH to order.depositWallet ...

        // Start the order
        await sdk.startBumpOrder(order.orderId);
        console.log('Order started!');

        // Check the status
        const status = await sdk.getOrderStatus(order.orderId);
        console.log('Order status:', status);

    } catch (error) {
        console.error('An error occurred:', error.message);
    }
}

main();
```

## Disclaimer

The ETH Bumper service is a powerful tool, but it should be used responsibly. Be aware of the following:

*   **Gas Fees:** All transactions on the Ethereum network require gas fees. While this service is optimized to reduce costs, you will still incur gas expenses.
*   **Security:** Never share your private keys. The service is designed to be secure, but you are responsible for the security of your own wallets and environment.
*   **Market Manipulation:** Be aware of the regulations and terms of service of the platforms you are using. This tool is intended for legitimate use cases, such as stress testing and volume generation for new tokens.

Use the ETH Bumper service at your own risk. The authors and contributors are not responsible for any financial losses or other damages that may result from its use.

const axios = require('axios');

class EthBumperSDK {
    constructor(serverUrl = 'http://localhost:3000/api') {
        this.api = axios.create({
            baseURL: serverUrl,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Create a new bump order
     * @param {string} tokenAddress - The address of the ERC-20 token to bump
     * @returns {Promise<Object>} Order details including deposit wallet
     */
    async createBumpOrder(tokenAddress) {
        try {
            const response = await this.api.post('/bump/create', { tokenAddress });
            return response.data;
        } catch (error) {
            throw new Error(error.response?.data?.error || error.message);
        }
    }

    /**
     * Get order status
     * @param {string} orderId - The order ID
     * @returns {Promise<Object>} Order status and details
     */
    async getOrderStatus(orderId) {
        try {
            const response = await this.api.get(`/bump/status/${orderId}`);
            return response.data;
        } catch (error) {
            throw new Error(error.response?.data?.error || error.message);
        }
    }

    /**
     * Start processing a bump order
     * @param {string} orderId - The order ID
     * @returns {Promise<Object>} Processing confirmation
     */
    async startBumpOrder(orderId) {
        try {
            const response = await this.api.post(`/bump/process/${orderId}`);
            return response.data;
        } catch (error) {
            throw new Error(error.response?.data?.error || error.message);
        }
    }

    /**
     * Get all orders
     * @returns {Promise<Array>} List of all orders
     */
    async getAllOrders() {
        try {
            const response = await this.api.get('/bump/orders');
            return response.data;
        } catch (error) {
            throw new Error(error.response?.data?.error || error.message);
        }
    }

    /**
     * Check API health
     * @returns {Promise<Object>} Health status
     */
    async checkHealth() {
        try {
            const response = await this.api.get('/health');
            return response.data;
        } catch (error) {
            throw new Error(error.response?.data?.error || error.message);
        }
    }

    /**
     * Monitor order progress with polling
     * @param {string} orderId - The order ID
     * @param {Function} callback - Callback function to receive status updates
     * @param {number} interval - Polling interval in milliseconds (default: 5000)
     * @returns {Function} Stop function to cancel monitoring
     */
    monitorOrder(orderId, callback, interval = 5000) {
        const intervalId = setInterval(async () => {
            try {
                const status = await this.getOrderStatus(orderId);
                callback(null, status);
                
                // Stop monitoring if order is completed or failed
                if (status.status === 'completed' || status.status === 'failed') {
                    clearInterval(intervalId);
                }
            } catch (error) {
                callback(error, null);
            }
        }, interval);

        // Return stop function
        return () => clearInterval(intervalId);
    }
}

module.exports = EthBumperSDK;

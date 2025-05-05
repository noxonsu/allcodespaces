import React, { useState, useEffect } from 'react';
import { fetchOrders } from '../api';

function MyOrdersPage() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('All');
    const [error, setError] = useState('');


    const loadOrders = (filter) => {
        setLoading(true);
        setError(''); // Clear previous errors
        fetchOrders(filter)
            .then(data => {
                setOrders(data);
            })
            .catch(err => {
                console.error("Failed to fetch orders:", err);
                setError("Could not load orders. Please try again later.");
            })
            .finally(() => {
                 setLoading(false);
            });
    };

    // Load orders on mount and when filter changes
    useEffect(() => {
        loadOrders(statusFilter);
    }, [statusFilter]);

    const handleFilterChange = (e) => {
        setStatusFilter(e.target.value);
    };

    return (
        <div className="container orders-table">
            <h2>My Orders</h2>
            <div>
                <label htmlFor="statusFilter">Filter by Status: </label>
                <select id="statusFilter" value={statusFilter} onChange={handleFilterChange}>
                    <option value="All">All</option>
                    <option value="Pending">Pending</option>
                    <option value="Processing">Processing</option>
                    <option value="Completed">Completed</option>
                    {/* Add other statuses as needed */}
                </select>
            </div>

            {loading && <p>Loading orders...</p>}
            {error && <p style={{ color: 'red' }}>Error: {error}</p>}

            {!loading && !error && (
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Link</th>
                            <th>Service</th>
                            <th>Quantity</th>
                            <th>Status</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.length > 0 ? (
                            orders.map(order => (
                                <tr key={order.id}>
                                    <td>{order.id}</td>
                                    <td>{order.link}</td>
                                    <td>{order.serviceName}</td>
                                    <td>{order.quantity}</td>
                                    <td>{order.status}</td>
                                    <td>{order.date}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="6">No orders found matching the criteria.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export default MyOrdersPage;

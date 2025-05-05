import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createOrder } from '../api';

function PaymentPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Get order details passed from OrderPage via state
    const orderDetails = location.state;

    // Redirect to home if state is missing (e.g., direct navigation)
    useEffect(() => {
        if (!orderDetails) {
            console.warn("No order details found in location state. Redirecting.");
            navigate('/');
        }
    }, [orderDetails, navigate]);

     // Render nothing or a loading indicator until redirect effect runs
    if (!orderDetails) {
        return <p className="container">No order details found. Redirecting...</p>;
    }


    const handlePayment = async () => {
        setIsLoading(true);
        setError('');
        try {
            const result = await createOrder({
                serviceId: orderDetails.serviceId,
                link: orderDetails.link,
                quantity: orderDetails.quantity,
            });

            if (result.success && result.paymentUrl) {
                // In a real app, redirect to the payment gateway:
                // window.location.href = result.paymentUrl;
                console.log("Redirecting to payment gateway:", result.paymentUrl);
                alert(`Order created (ID: ${result.orderId})! In a real app, you would be redirected to: ${result.paymentUrl}`);
                // Simulate successful payment and redirect to My Orders
                navigate('/my-orders');
            } else {
                setError('Failed to create order or get payment link.');
            }
        } catch (err) {
            console.error("Payment initiation failed:", err);
            setError('An error occurred during payment initiation.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container payment-info">
            <h2>Confirm Your Order</h2>
            <p><strong>Service:</strong> {orderDetails.serviceName}</p>
            <p><strong>Link:</strong> {orderDetails.link}</p>
            <p><strong>Quantity:</strong> {orderDetails.quantity}</p>
            <p><strong>Price per item:</strong> ${orderDetails.price}</p>
            <p><strong>Total Cost:</strong> ${orderDetails.totalCost.toFixed(2)}</p>
            {/* Add payment method selection here if needed */}
            <button onClick={handlePayment} disabled={isLoading}>
                {isLoading ? 'Processing...' : 'Confirm and Pay'}
            </button>
            {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
    );
}

export default PaymentPage;

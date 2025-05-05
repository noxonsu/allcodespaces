import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchServiceById } from '../api';

function OrderPage() {
    const { serviceId } = useParams();
    const navigate = useNavigate();
    const [service, setService] = useState(null);
    const [link, setLink] = useState('');
    const [quantity, setQuantity] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetchServiceById(serviceId)
            .then(data => {
                if (data) {
                    setService(data);
                    setQuantity(data.min || ''); // Pre-fill with min quantity
                } else {
                     setError("Service not found.");
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch service details:", err);
                setError("Could not load service details.");
                setLoading(false);
            });
    }, [serviceId]);

    const handleSubmit = (e) => {
        e.preventDefault();
        setError(''); // Clear previous errors

        if (!service) {
             setError("Service data is not loaded.");
             return;
        }

        if (!link) {
            setError('Link is required.');
            return;
        }

        const numQuantity = Number(quantity);
        if (isNaN(numQuantity) || numQuantity < service.min || numQuantity > service.max) {
            setError(`Quantity must be a number between ${service.min} and ${service.max}.`);
            return;
        }

        // Navigate to payment page, passing order details via state
        navigate('/payment', {
            state: {
                serviceId: service.id,
                serviceName: service.name,
                link: link,
                quantity: numQuantity,
                price: service.price,
                totalCost: numQuantity * service.price
            }
        });
    };

    if (loading) return <p className="container">Loading service details...</p>;
    // Display error if service fetch failed or service not found
    if (error) return <p className="container">Error: {error}</p>;
    if (!service) return <p className="container">Service not found.</p>; // Should be covered by error state, but good failsafe


    return (
        <div className="container order-form">
            <h2>Order Service: {service.name}</h2>
            <p>Price per item: ${service.price}</p>
            <p>Order limits: Min {service.min}, Max {service.max}</p>
            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="link">Link:</label>
                    <input
                        type="text"
                        id="link"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        required
                        style={{width: '100%'}} // Ensure full width
                    />
                </div>
                <div>
                    <label htmlFor="quantity">Quantity:</label>
                    <input
                        type="number"
                        id="quantity"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        min={service.min}
                        max={service.max}
                        required
                        style={{width: '100px'}} // Fixed width for quantity
                    />
                </div>
                {error && <p style={{ color: 'red' }}>{error}</p>}
                <button type="submit">Proceed to Payment</button>
            </form>
        </div>
    );
}

export default OrderPage;

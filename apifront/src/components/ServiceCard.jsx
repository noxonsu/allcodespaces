import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function ServiceCard({ service }) {
    const [detailsVisible, setDetailsVisible] = useState(false);
    const navigate = useNavigate();

    const handleOrderClick = () => {
        navigate(`/order/${service.id}`);
    };

    return (
        <div className="service-card">
            <h3>{service.name}</h3>
            <p>Price: ${service.price}</p>
            <p>Min: {service.min} / Max: {service.max}</p>
            <button onClick={() => setDetailsVisible(!detailsVisible)}>
                {detailsVisible ? 'Hide Details' : 'Show Details'}
            </button>
            {detailsVisible && (
                <div style={{ marginTop: '0.5em', borderTop: '1px solid #eee', paddingTop: '0.5em' }}>
                    <p>{service.description}</p>
                </div>
            )}
            <button onClick={handleOrderClick} style={{ marginTop: '0.5em' }}>
                Order Now
            </button>
        </div>
    );
}

export default ServiceCard;

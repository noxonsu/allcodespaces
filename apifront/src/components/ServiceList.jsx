import React from 'react';
import ServiceCard from './ServiceCard';

function ServiceList({ services }) {
    if (!services || services.length === 0) {
        return <p>No services found matching your criteria.</p>;
    }
    return (
        <div className="service-list">
            {services.map(service => (
                <ServiceCard key={service.id} service={service} />
            ))}
        </div>
    );
}

export default ServiceList;

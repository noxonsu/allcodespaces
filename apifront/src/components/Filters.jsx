import React, { useState } from 'react';

function Filters({ onFilterChange, initialFilters }) {
    const [filters, setFilters] = useState(initialFilters);

    const handleChange = (e) => {
        const { name, value } = e.target;
        // Allow clearing the filter by setting to null if input is empty
        const numericValue = value === '' ? null : Number(value);
        // Ensure only valid numbers (or null) are set
        if (value === '' || !isNaN(numericValue)) {
             const newFilters = { ...filters, [name]: numericValue };
             setFilters(newFilters);
             onFilterChange(newFilters); // Apply filters immediately on change
        }
    };

     // Basic slider simulation with number inputs
    return (
        <div className="filters">
            <h4>Filters</h4>
            <div>
                <label>Min Price: <input type="number" name="minPrice" value={filters.minPrice ?? ''} onChange={handleChange} placeholder="Any" /></label>
            </div>
             <div>
                <label>Max Price: <input type="number" name="maxPrice" value={filters.maxPrice ?? ''} onChange={handleChange} placeholder="Any" /></label>
            </div>
            <div>
                <label>Min Order: <input type="number" name="minOrder" value={filters.minOrder ?? ''} onChange={handleChange} placeholder="Any" /></label>
            </div>
             <div>
                <label>Max Order: <input type="number" name="maxOrder" value={filters.maxOrder ?? ''} onChange={handleChange} placeholder="Any" /></label>
            </div>
            {/* Add more filters as needed */}
        </div>
    );
}

export default Filters;

import React, { useState, useEffect } from 'react';
import CategoryMenu from '../components/CategoryMenu';
import Filters from '../components/Filters';
import ServiceList from '../components/ServiceList';
import { fetchCategories, fetchServices } from '../api';

function HomePage() {
    const [categories, setCategories] = useState([]);
    const [services, setServices] = useState([]);
    const [filteredServices, setFilteredServices] = useState([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState(null);
    const [selectedSubcategoryId, setSelectedSubcategoryId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        minPrice: null,
        maxPrice: null,
        minOrder: null,
        maxOrder: null,
    });

    // Fetch categories on mount
    useEffect(() => {
        fetchCategories().then(data => {
            setCategories(data);
        }).catch(err => console.error("Failed to fetch categories:", err));
    }, []);

    // Fetch services when category/subcategory changes
    useEffect(() => {
        setLoading(true);
        fetchServices(selectedCategoryId, selectedSubcategoryId)
            .then(data => {
                setServices(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch services:", err);
                setLoading(false);
            });
    }, [selectedCategoryId, selectedSubcategoryId]);

     // Apply filters whenever services or filter values change
    useEffect(() => {
        let currentServices = [...services];
        if (filters.minPrice !== null) {
            currentServices = currentServices.filter(s => s.price >= filters.minPrice);
        }
         if (filters.maxPrice !== null) {
            currentServices = currentServices.filter(s => s.price <= filters.maxPrice);
        }
        // Note: Filtering by min/max *order* limits might be confusing.
        // Usually, you filter services based on *their* limits, not a user-defined limit range.
        // The current implementation filters services *whose* min limit is >= filter.minOrder
        // and *whose* max limit is <= filter.maxOrder. Adjust if needed.
        if (filters.minOrder !== null) {
            currentServices = currentServices.filter(s => s.min >= filters.minOrder);
        }
         if (filters.maxOrder !== null) {
            currentServices = currentServices.filter(s => s.max <= filters.maxOrder);
        }
        setFilteredServices(currentServices);
    }, [services, filters]);


    const handleSelectCategory = (categoryId) => {
        setSelectedCategoryId(categoryId);
        setSelectedSubcategoryId(null); // Reset subcategory when main category changes
    };

    const handleSelectSubcategory = (categoryId, subcategoryId) => {
         setSelectedCategoryId(categoryId); // Ensure parent category is also selected
         setSelectedSubcategoryId(subcategoryId);
    };

     const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
    };


    return (
        <div className="container">
            <h2>Services</h2>
            <CategoryMenu
                categories={categories}
                onSelectCategory={handleSelectCategory}
                onSelectSubcategory={handleSelectSubcategory}
                selectedCategoryId={selectedCategoryId}
                selectedSubcategoryId={selectedSubcategoryId}
            />
            <Filters onFilterChange={handleFilterChange} initialFilters={filters} />
            {loading ? <p>Loading services...</p> : <ServiceList services={filteredServices} />}
        </div>
    );
}

export default HomePage;

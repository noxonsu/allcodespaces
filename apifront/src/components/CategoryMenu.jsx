import React, { useState } from 'react';

function CategoryMenu({ categories, onSelectCategory, onSelectSubcategory, selectedCategoryId, selectedSubcategoryId }) {
    const [expandedCategories, setExpandedCategories] = useState({});

    const toggleCategory = (categoryId) => {
        setExpandedCategories(prev => ({ ...prev, [categoryId]: !prev[categoryId] }));
        // Select category only if not already selected or expanding
         if (selectedCategoryId !== categoryId) {
            onSelectCategory(categoryId);
         }
    };

    return (
        <div className="category-menu">
            <h4>Categories</h4>
            {categories.map(cat => (
                <div key={cat.id}>
                    <strong
                        onClick={() => toggleCategory(cat.id)}
                        style={{ cursor: 'pointer', color: selectedCategoryId === cat.id ? 'blue' : 'black' }}
                    >
                        {cat.name} {expandedCategories[cat.id] ? '[-]' : '[+]'}
                    </strong>
                    {expandedCategories[cat.id] && (
                        <ul>
                            {cat.subcategories.map(sub => (
                                <li
                                    key={sub.id}
                                    onClick={() => onSelectSubcategory(cat.id, sub.id)}
                                    style={{ cursor: 'pointer', fontWeight: selectedSubcategoryId === sub.id ? 'bold' : 'normal' }}
                                >
                                    {sub.name}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}
             <button onClick={() => onSelectCategory(null)}>Show All</button>
        </div>
    );
}

export default CategoryMenu;

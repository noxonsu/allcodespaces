// Replace these with actual fetch/axios calls to your backend API

export const fetchCategories = async () => {
    console.log("API: Fetching categories...");
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    // Placeholder data
    return [
        { id: 1, name: 'Platform A', subcategories: [
            { id: 11, name: 'A - Social Media' },
            { id: 12, name: 'A - SEO' }
        ]},
        { id: 2, name: 'Platform B', subcategories: [
            { id: 21, name: 'B - Advertising' },
            { id: 22, name: 'B - Content Creation' }
        ]},
    ];
};

export const fetchServices = async (categoryId, subcategoryId) => {
    console.log(`API: Fetching services for category ${categoryId}, subcategory ${subcategoryId}...`);
    await new Promise(resolve => setTimeout(resolve, 500));
    // Placeholder data - filter based on category/subcategory
    const allServices = [
        { id: 101, categoryId: 1, subcategoryId: 11, name: 'Service A1', price: 10, min: 100, max: 1000, description: 'Detailed description for Service A1.' },
        { id: 102, categoryId: 1, subcategoryId: 11, name: 'Service A2', price: 15, min: 50, max: 5000, description: 'Detailed description for Service A2.' },
        { id: 103, categoryId: 1, subcategoryId: 12, name: 'Service A3', price: 25, min: 1, max: 10, description: 'Detailed description for Service A3.' },
        { id: 201, categoryId: 2, subcategoryId: 21, name: 'Service B1', price: 50, min: 1, max: 100, description: 'Detailed description for Service B1.' },
        { id: 202, categoryId: 2, subcategoryId: 22, name: 'Service B2', price: 5, min: 1000, max: 10000, description: 'Detailed description for Service B2.' },
    ];
    return allServices.filter(s =>
        (!categoryId || s.categoryId === categoryId) &&
        (!subcategoryId || s.subcategoryId === subcategoryId)
    );
};

export const fetchServiceById = async (serviceId) => {
     console.log(`API: Fetching service by ID ${serviceId}...`);
     await new Promise(resolve => setTimeout(resolve, 200));
     const allServices = [ // Duplicating data for simplicity here
        { id: 101, categoryId: 1, subcategoryId: 11, name: 'Service A1', price: 10, min: 100, max: 1000, description: 'Detailed description for Service A1.' },
        { id: 102, categoryId: 1, subcategoryId: 11, name: 'Service A2', price: 15, min: 50, max: 5000, description: 'Detailed description for Service A2.' },
        { id: 103, categoryId: 1, subcategoryId: 12, name: 'Service A3', price: 25, min: 1, max: 10, description: 'Detailed description for Service A3.' },
        { id: 201, categoryId: 2, subcategoryId: 21, name: 'Service B1', price: 50, min: 1, max: 100, description: 'Detailed description for Service B1.' },
        { id: 202, categoryId: 2, subcategoryId: 22, name: 'Service B2', price: 5, min: 1000, max: 10000, description: 'Detailed description for Service B2.' },
    ];
    return allServices.find(s => s.id === parseInt(serviceId));
}

export const createOrder = async (orderData) => {
    console.log("API: Creating order...", orderData);
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Simulate successful order creation and payment link generation
    return { success: true, paymentUrl: 'https://example.com/pay/12345', orderId: Date.now() };
};

export const fetchOrders = async (statusFilter = null) => {
    console.log(`API: Fetching orders (filter: ${statusFilter})...`);
    await new Promise(resolve => setTimeout(resolve, 600));
    // Placeholder data
    const allOrders = [
        { id: 12345, link: 'http://example.com/post1', serviceName: 'Service A1', quantity: 500, status: 'Completed', date: '2023-10-26' },
        { id: 12346, link: 'http://example.com/post2', serviceName: 'Service B2', quantity: 2000, status: 'Pending', date: '2023-10-27' },
        { id: 12347, link: 'http://example.com/post3', serviceName: 'Service A3', quantity: 5, status: 'Processing', date: '2023-10-27' },
        { id: 12348, link: 'http://example.com/post4', serviceName: 'Service B1', quantity: 10, status: 'Completed', date: '2023-10-28' },
    ];
    if (statusFilter && statusFilter !== 'All') {
        return allOrders.filter(o => o.status === statusFilter);
    }
    return allOrders;
};

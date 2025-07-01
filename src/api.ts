import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000', // Changed to match Express backend port
  withCredentials: true,
});

export default api;
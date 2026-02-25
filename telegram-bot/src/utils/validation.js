import { ethers } from 'ethers';

/**
 * Validate Ethereum address
 */
export function isValidAddress(address) {
  try {
    return ethers.isAddress(address);
  } catch (error) {
    return false;
  }
}

/**
 * Normalize Ethereum address to checksum format
 */
export function normalizeAddress(address) {
  try {
    return ethers.getAddress(address);
  } catch (error) {
    return null;
  }
}

/**
 * Validate trade amount
 */
export function isValidAmount(amount, min = 1, max = 1000) {
  const num = parseFloat(amount);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * Validate percentage (0-100)
 */
export function isValidPercentage(value) {
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0 && num <= 100;
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input, maxLength = 200) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength);
}

/**
 * Validate referral code format
 */
export function isValidReferralCode(code) {
  // Alphanumeric, 6-20 characters
  return /^[a-zA-Z0-9]{6,20}$/.test(code);
}

/**
 * Generate unique referral code
 */
export function generateReferralCode(telegramId) {
  const prefix = 'ep';
  const suffix = telegramId.toString(36).slice(-8);
  return `${prefix}${suffix}`;
}

export default {
  isValidAddress,
  normalizeAddress,
  isValidAmount,
  isValidPercentage,
  sanitizeInput,
  isValidReferralCode,
  generateReferralCode
};

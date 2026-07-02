import type { FilePurpose, FilePurposePolicy } from '../types/file.types';

export const FILE_STORAGE_PROVIDER = Symbol('FILE_STORAGE_PROVIDER');

export const FILE_PURPOSES = [
  'payment_proof',
  'complaint_attachment',
  'maintenance_attachment',
  'vehicle_photo',
  'vehicle_document',
  'room_photo',
  'property_logo',
  'ktp',
] as const;

export const FILE_STORAGE_DRIVERS = ['local', 's3'] as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const FILE_PURPOSE_POLICIES: Record<FilePurpose, FilePurposePolicy> = {
  payment_proof: {
    purpose: 'payment_proof',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxBytesByMimeType: {
      'image/jpeg': 2 * 1024 * 1024,
      'image/png': 2 * 1024 * 1024,
      'application/pdf': 5 * 1024 * 1024,
    },
  },
  complaint_attachment: {
    purpose: 'complaint_attachment',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxBytesByMimeType: {
      'image/jpeg': 2 * 1024 * 1024,
      'image/png': 2 * 1024 * 1024,
    },
  },
  maintenance_attachment: {
    purpose: 'maintenance_attachment',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxBytesByMimeType: {
      'image/jpeg': 2 * 1024 * 1024,
      'image/png': 2 * 1024 * 1024,
    },
  },
  vehicle_photo: {
    purpose: 'vehicle_photo',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxBytesByMimeType: {
      'image/jpeg': 2 * 1024 * 1024,
      'image/png': 2 * 1024 * 1024,
    },
  },
  vehicle_document: {
    purpose: 'vehicle_document',
    allowedMimeTypes: ['application/pdf'],
    maxBytesByMimeType: {
      'application/pdf': 5 * 1024 * 1024,
    },
  },
  room_photo: {
    purpose: 'room_photo',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxBytesByMimeType: {
      'image/jpeg': 2 * 1024 * 1024,
      'image/png': 2 * 1024 * 1024,
    },
  },
  property_logo: {
    purpose: 'property_logo',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxBytesByMimeType: {
      'image/jpeg': 1 * 1024 * 1024,
      'image/png': 1 * 1024 * 1024,
    },
  },
  ktp: {
    purpose: 'ktp',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxBytesByMimeType: {
      'image/jpeg': 2 * 1024 * 1024,
      'image/png': 2 * 1024 * 1024,
      'application/pdf': 5 * 1024 * 1024,
    },
  },
};

export const DANGEROUS_FILE_EXTENSIONS = new Set([
  'exe',
  'sh',
  'bat',
  'cmd',
  'ps1',
  'vbs',
  'js',
  'html',
  'htm',
  'svg',
  'xml',
  'php',
  'asp',
  'jar',
  'war',
]);

export const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'application/pdf': ['pdf'],
};

export const FILE_UPLOAD_RATE_LIMITS = {
  perUserMinute: { limit: 10, windowSeconds: 60 },
  perUserHour: { limit: 50, windowSeconds: 60 * 60 },
  perPropertyHour: { limit: 100, windowSeconds: 60 * 60 },
} as const;

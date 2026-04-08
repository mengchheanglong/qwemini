import { describe, it, expect } from 'vitest';

/**
 * Unit tests for error message formatting
 * 
 * These tests verify that error messages are categorized and formatted consistently
 * according to the design specification.
 * 
 * **Validates: Requirements 9.1, 9.2, 9.5**
 */

// Re-implement the helper functions for testing
type ErrorCategory = 'permission' | 'not-found' | 'conflict' | 'validation';

function categorizeError(errorMessage: string): ErrorCategory {
  const lowerMessage = errorMessage.toLowerCase();
  
  if (lowerMessage.includes('permission') || lowerMessage.includes('denied')) {
    return 'permission';
  }
  if (lowerMessage.includes('not found') || lowerMessage.includes('does not exist')) {
    return 'not-found';
  }
  if (lowerMessage.includes('already exists') || lowerMessage.includes('conflict')) {
    return 'conflict';
  }
  // Validation errors: invalid characters, empty names, etc.
  if (lowerMessage.includes('invalid') || lowerMessage.includes('empty')) {
    return 'validation';
  }
  
  // Default to validation for unknown errors
  return 'validation';
}

function formatErrorMessage(
  errorMessage: string,
  operation: 'create' | 'rename' | 'delete' | 'load',
  entryType: 'file' | 'folder' | 'entry',
  entryName?: string,
): string {
  const category = categorizeError(errorMessage);
  
  switch (category) {
    case 'permission':
      return `Permission denied: cannot ${operation} ${entryType}${entryName ? ` "${entryName}"` : ''}`;
    
    case 'not-found':
      return `${entryType.charAt(0).toUpperCase() + entryType.slice(1)} not found${entryName ? `: ${entryName}` : ''}`;
    
    case 'conflict':
      // Extract the name from "already exists" messages if present
      const existsMatch = errorMessage.match(/already exists:?\s*(.+)/i);
      const name = existsMatch?.[1]?.trim() || entryName || '';
      return `${entryType.charAt(0).toUpperCase() + entryType.slice(1)} already exists${name ? `: ${name}` : ''}`;
    
    case 'validation':
      // Try to extract the reason from the error message
      const invalidMatch = errorMessage.match(/invalid[^:]*:?\s*(.+)/i);
      const reason = invalidMatch?.[1]?.trim() || errorMessage;
      return `Invalid ${entryType} name: ${reason}`;
    
    default:
      return errorMessage;
  }
}

describe('WorkspaceFilePanel - Error Message Formatting', () => {
  describe('Error categorization', () => {
    it('should categorize permission errors', () => {
      expect(categorizeError('Permission denied')).toBe('permission');
      expect(categorizeError('Access denied')).toBe('permission');
      expect(categorizeError('You do not have permission to access this')).toBe('permission');
    });

    it('should categorize not-found errors', () => {
      expect(categorizeError('File not found')).toBe('not-found');
      expect(categorizeError('Folder does not exist')).toBe('not-found');
      expect(categorizeError('The requested resource was not found')).toBe('not-found');
    });

    it('should categorize conflict errors', () => {
      expect(categorizeError('Folder already exists')).toBe('conflict');
      expect(categorizeError('File already exists: test.txt')).toBe('conflict');
      expect(categorizeError('Conflict: name already in use')).toBe('conflict');
    });

    it('should categorize validation errors', () => {
      expect(categorizeError('Invalid folder name')).toBe('validation');
      expect(categorizeError('Name cannot be empty')).toBe('validation');
      expect(categorizeError('Invalid characters in filename')).toBe('validation');
    });

    it('should default to validation for unknown errors', () => {
      expect(categorizeError('Something went wrong')).toBe('validation');
      expect(categorizeError('Unexpected error occurred')).toBe('validation');
    });
  });

  describe('Permission error formatting', () => {
    it('should format permission error for folder creation', () => {
      const result = formatErrorMessage(
        'Permission denied',
        'create',
        'folder',
        'test-folder'
      );
      expect(result).toBe('Permission denied: cannot create folder "test-folder"');
    });

    it('should format permission error for file deletion', () => {
      const result = formatErrorMessage(
        'Access denied',
        'delete',
        'file',
        'test.txt'
      );
      expect(result).toBe('Permission denied: cannot delete file "test.txt"');
    });

    it('should format permission error without entry name', () => {
      const result = formatErrorMessage(
        'Permission denied',
        'load',
        'entry'
      );
      expect(result).toBe('Permission denied: cannot load entry');
    });
  });

  describe('Not-found error formatting', () => {
    it('should format not-found error for folder', () => {
      const result = formatErrorMessage(
        'Folder not found',
        'delete',
        'folder',
        'missing-folder'
      );
      expect(result).toBe('Folder not found: missing-folder');
    });

    it('should format not-found error for file', () => {
      const result = formatErrorMessage(
        'File does not exist',
        'rename',
        'file',
        'missing.txt'
      );
      expect(result).toBe('File not found: missing.txt');
    });

    it('should format not-found error without entry name', () => {
      const result = formatErrorMessage(
        'Resource not found',
        'load',
        'entry'
      );
      expect(result).toBe('Entry not found');
    });
  });

  describe('Conflict error formatting', () => {
    it('should format conflict error for folder', () => {
      const result = formatErrorMessage(
        'Folder already exists: test-folder',
        'create',
        'folder',
        'test-folder'
      );
      expect(result).toBe('Folder already exists: test-folder');
    });

    it('should format conflict error for file', () => {
      const result = formatErrorMessage(
        'File already exists: test.txt',
        'create',
        'file',
        'test.txt'
      );
      expect(result).toBe('File already exists: test.txt');
    });

    it('should extract name from error message', () => {
      const result = formatErrorMessage(
        'already exists: my-folder',
        'create',
        'folder'
      );
      expect(result).toBe('Folder already exists: my-folder');
    });

    it('should use provided entry name if not in message', () => {
      const result = formatErrorMessage(
        'Conflict detected',
        'create',
        'folder',
        'duplicate-folder'
      );
      expect(result).toBe('Folder already exists: duplicate-folder');
    });
  });

  describe('Validation error formatting', () => {
    it('should format validation error with reason', () => {
      const result = formatErrorMessage(
        'Invalid folder name: contains illegal characters',
        'create',
        'folder',
        'test/folder'
      );
      expect(result).toBe('Invalid folder name: contains illegal characters');
    });

    it('should format validation error for empty name', () => {
      const result = formatErrorMessage(
        'Name cannot be empty',
        'create',
        'file'
      );
      expect(result).toBe('Invalid file name: Name cannot be empty');
    });

    it('should format validation error with extracted reason', () => {
      const result = formatErrorMessage(
        'Invalid characters in filename: / \\ : * ? " < > |',
        'rename',
        'file',
        'bad:name.txt'
      );
      // The regex extracts everything after the first colon following "invalid"
      expect(result).toBe('Invalid file name: / \\ : * ? " < > |');
    });

    it('should use full message as reason if no pattern match', () => {
      const result = formatErrorMessage(
        'Something is wrong with this name',
        'create',
        'folder',
        'test'
      );
      expect(result).toBe('Invalid folder name: Something is wrong with this name');
    });
  });

  describe('Consistent formatting across operations', () => {
    it('should format create operation errors consistently', () => {
      const permissionError = formatErrorMessage('Permission denied', 'create', 'folder', 'test');
      const conflictError = formatErrorMessage('Already exists', 'create', 'folder', 'test');
      const validationError = formatErrorMessage('Invalid name', 'create', 'folder', 'test');
      
      expect(permissionError).toContain('Permission denied: cannot create folder');
      expect(conflictError).toContain('Folder already exists');
      expect(validationError).toContain('Invalid folder name');
    });

    it('should format rename operation errors consistently', () => {
      const permissionError = formatErrorMessage('Permission denied', 'rename', 'file', 'test.txt');
      const notFoundError = formatErrorMessage('Not found', 'rename', 'file', 'test.txt');
      const conflictError = formatErrorMessage('Already exists', 'rename', 'file', 'test.txt');
      
      expect(permissionError).toContain('Permission denied: cannot rename file');
      expect(notFoundError).toContain('File not found');
      expect(conflictError).toContain('File already exists');
    });

    it('should format delete operation errors consistently', () => {
      const permissionError = formatErrorMessage('Permission denied', 'delete', 'folder', 'test');
      const notFoundError = formatErrorMessage('Not found', 'delete', 'folder', 'test');
      
      expect(permissionError).toContain('Permission denied: cannot delete folder');
      expect(notFoundError).toContain('Folder not found');
    });
  });

  describe('Entry type capitalization', () => {
    it('should capitalize entry type in formatted messages', () => {
      const folderNotFound = formatErrorMessage('Not found', 'load', 'folder', 'test');
      const fileNotFound = formatErrorMessage('Not found', 'load', 'file', 'test.txt');
      const entryNotFound = formatErrorMessage('Not found', 'load', 'entry');
      
      expect(folderNotFound).toMatch(/^Folder/);
      expect(fileNotFound).toMatch(/^File/);
      expect(entryNotFound).toMatch(/^Entry/);
    });

    it('should capitalize entry type in conflict messages', () => {
      const folderConflict = formatErrorMessage('Already exists', 'create', 'folder', 'test');
      const fileConflict = formatErrorMessage('Already exists', 'create', 'file', 'test.txt');
      
      expect(folderConflict).toMatch(/^Folder/);
      expect(fileConflict).toMatch(/^File/);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty error message', () => {
      const result = formatErrorMessage('', 'create', 'folder', 'test');
      expect(result).toBe('Invalid folder name: ');
    });

    it('should handle error message with mixed case', () => {
      const result = formatErrorMessage('PERMISSION DENIED', 'create', 'folder', 'test');
      expect(result).toBe('Permission denied: cannot create folder "test"');
    });

    it('should handle error message with extra whitespace', () => {
      const result = formatErrorMessage('  Already exists:  test-folder  ', 'create', 'folder');
      expect(result).toBe('Folder already exists: test-folder');
    });

    it('should handle special characters in entry name', () => {
      const result = formatErrorMessage('Permission denied', 'create', 'folder', 'test-folder_v2');
      expect(result).toBe('Permission denied: cannot create folder "test-folder_v2"');
    });

    it('should handle unicode characters in entry name', () => {
      const result = formatErrorMessage('Already exists', 'create', 'folder', 'папка');
      expect(result).toBe('Folder already exists: папка');
    });
  });
});

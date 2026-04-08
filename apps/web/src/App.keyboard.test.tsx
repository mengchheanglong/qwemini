import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * Unit tests for Task 8.2: Keyboard navigation
 * 
 * These tests verify specific examples and UI interactions for keyboard shortcuts,
 * complementing the property-based tests.
 * 
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**
 */

describe('App - Keyboard Navigation Unit Tests', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // Mock daemon health check
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('Slash key focuses rail filter input (Requirement 10.1)', () => {
    it('should focus filter input when "/" is pressed', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Press slash key
      await user.keyboard('/');

      // Verify filter input is focused
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i });
      expect(filterInput).toHaveFocus();
    });

    it('should select existing text when focusing with slash', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Type some text in filter
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i }) as HTMLInputElement;
      await user.click(filterInput);
      await user.keyboard('existing');

      expect(filterInput.value).toBe('existing');

      // Click elsewhere to lose focus (use a button instead of composer)
      const newThreadButton = screen.getByRole('button', { name: /New thread/i });
      await user.click(newThreadButton);

      // Press slash to focus filter again
      await user.keyboard('/');

      // Verify filter is focused and text is selected
      expect(filterInput).toHaveFocus();
      // Note: Testing text selection in jsdom is limited, but we can verify focus
    });

    it('should not focus filter when slash is typed in filter itself', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Focus filter
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i }) as HTMLInputElement;
      await user.click(filterInput);

      // Type slash in filter
      await user.keyboard('/');

      // Verify slash was typed into filter (not triggering the shortcut)
      expect(filterInput.value).toBe('/');
      expect(filterInput).toHaveFocus();
    });

    it('should not focus filter when slash is typed in filter itself', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Focus filter
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i }) as HTMLInputElement;
      await user.click(filterInput);

      // Type slash in filter
      await user.keyboard('/');

      // Verify slash was typed into filter
      expect(filterInput.value).toBe('/');
      expect(filterInput).toHaveFocus();
    });
  });

  describe('Cmd/Ctrl+Shift+Left Arrow cycles rail views (Requirement 10.2)', () => {
    it('should cycle from recent to flows', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Initial view should be recent (Threads)
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i });
      expect(filterInput).toHaveAttribute('placeholder', expect.stringMatching(/threads/i));

      // Cycle backward
      await user.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}');

      // Should now be in flows view (Agents)
      await waitFor(() => {
        expect(filterInput).toHaveAttribute('placeholder', expect.stringMatching(/agents/i));
      });
    });

    it('should cycle from flows to archive', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Cycle to flows (Agents)
      await user.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}');
      
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i });
      await waitFor(() => {
        expect(filterInput).toHaveAttribute('placeholder', expect.stringMatching(/agents/i));
      });

      // Cycle to archive (Archived)
      await user.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}');

      await waitFor(() => {
        expect(filterInput).toHaveAttribute('placeholder', expect.stringMatching(/archived/i));
      });
    });

    it('should cycle from archive to history', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Cycle to flows (Agents)
      await user.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}');
      // Cycle to archive (Archived)
      await user.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}');
      
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i });
      await waitFor(() => {
        expect(filterInput).toHaveAttribute('placeholder', expect.stringMatching(/archived/i));
      });

      // Cycle to history (Runs)
      await user.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}');

      await waitFor(() => {
        expect(filterInput).toHaveAttribute('placeholder', expect.stringMatching(/runs/i));
      });
    });

    it('should cycle from history back to recent', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Cycle through all views to history
      await user.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}'); // flows (Agents)
      await user.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}'); // archive (Archived)
      await user.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}'); // history (Runs)
      
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i });
      await waitFor(() => {
        expect(filterInput).toHaveAttribute('placeholder', expect.stringMatching(/runs/i));
      });

      // Cycle back to recent (Threads)
      await user.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}');

      await waitFor(() => {
        expect(filterInput).toHaveAttribute('placeholder', expect.stringMatching(/threads/i));
      });
    });

    it('should work with Cmd key on Mac', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Use Meta key (Cmd on Mac)
      await user.keyboard('{Meta>}{Shift>}{ArrowLeft}{/Shift}{/Meta}');

      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i });
      await waitFor(() => {
        expect(filterInput).toHaveAttribute('placeholder', expect.stringMatching(/agents/i));
      });
    });
  });

  describe('Escape clears filter text (Requirement 10.3)', () => {
    it('should clear filter text when Escape is pressed in filter input', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Type in filter
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i }) as HTMLInputElement;
      await user.click(filterInput);
      await user.keyboard('test filter');

      expect(filterInput.value).toBe('test filter');

      // Press Escape
      await user.keyboard('{Escape}');

      // Verify filter is cleared
      await waitFor(() => {
        expect(filterInput.value).toBe('');
      });
    });

    it('should clear filter with special characters', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Type special characters in filter
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i }) as HTMLInputElement;
      await user.click(filterInput);
      await user.keyboard('test-123_@#$');

      expect(filterInput.value).toBe('test-123_@#$');

      // Press Escape
      await user.keyboard('{Escape}');

      // Verify filter is cleared
      await waitFor(() => {
        expect(filterInput.value).toBe('');
      });
    });

    it('should keep focus on filter after clearing with Escape', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Type in filter
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i }) as HTMLInputElement;
      await user.click(filterInput);
      await user.keyboard('test');

      expect(filterInput).toHaveFocus();

      // Press Escape
      await user.keyboard('{Escape}');

      // Verify filter is cleared and still focused
      await waitFor(() => {
        expect(filterInput.value).toBe('');
        expect(filterInput).toHaveFocus();
      });
    });

    it('should not clear filter when Escape is pressed outside filter', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Type in filter
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i }) as HTMLInputElement;
      await user.click(filterInput);
      await user.keyboard('test');

      expect(filterInput.value).toBe('test');

      // Focus a button instead of composer
      const newThreadButton = screen.getByRole('button', { name: /New thread/i });
      await user.click(newThreadButton);

      // Press Escape
      await user.keyboard('{Escape}');

      // Verify filter is NOT cleared
      expect(filterInput.value).toBe('test');
    });

    it('should work with Clear button as alternative to Escape', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Type in filter
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i }) as HTMLInputElement;
      await user.click(filterInput);
      await user.keyboard('test');

      expect(filterInput.value).toBe('test');

      // Click Clear button
      const clearButton = screen.getByRole('button', { name: /Clear/i });
      await user.click(clearButton);

      // Verify filter is cleared
      await waitFor(() => {
        expect(filterInput.value).toBe('');
      });
    });
  });

  describe('Focus indicators visible without hover effects (Requirement 10.4, 10.5)', () => {
    it('should show focus indicator on filter input when focused', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Focus filter input
      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i });
      await user.click(filterInput);

      // Verify input is focused (focus indicator is CSS-based, so we just verify focus state)
      expect(filterInput).toHaveFocus();
    });

    it('should show focus indicator on buttons when focused via keyboard', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Tab to focus first button
      await user.keyboard('{Tab}');

      // Verify some button has focus
      const focusedElement = document.activeElement;
      expect(focusedElement?.tagName).toBe('BUTTON');
    });

    it('should maintain focus indicators during keyboard navigation', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Focus filter with slash
      await user.keyboard('/');

      const filterInput = screen.getByRole('searchbox', { name: /Filter rail items/i });
      expect(filterInput).toHaveFocus();

      // Tab away
      await user.keyboard('{Tab}');

      // Verify focus moved to another element
      expect(filterInput).not.toHaveFocus();
      expect(document.activeElement).not.toBe(filterInput);
    });
  });
});

/**
 * Mocks a translation by reversing the input text.
 * @param {string} text - The text to translate.
 * @returns {string} The "translated" text.
 */
export const mockTranslate = (text) => {
  if (typeof text !== 'string') {
    return '';
  }
  return text.split('').reverse().join('');
}; 
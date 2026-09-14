import unittest

from score import accuracy, edits, norm


class BenchmarkScoreTests(unittest.TestCase):
    def test_word_edits(self):
        self.assertEqual(edits(norm("anyị have rights").split(), norm("anyị get rights").split()), 1)

    def test_unicode_normalization(self):
        self.assertEqual(norm("  Ńdị! "), "ńdị")

    def test_phrase_preservation(self):
        self.assertEqual(accuracy("biko|section 36", "Biko explain section 36"), 1.0)


if __name__ == "__main__":
    unittest.main()

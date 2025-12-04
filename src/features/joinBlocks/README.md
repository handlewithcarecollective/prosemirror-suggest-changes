Inside the replaced range, between stepFrom and stepTo in replaceStep.ts we will
join blocks if on the two sides of the block we find matching ZWSP pairs. For
that we will need a function to find ZWSP in the range and on the boundaries (
the next content outside our range ) Then we have to make pairs out of them.
Then find the positions between those pairs. Then try to do block joins between
those pairs If the block joins were successful then remove the ZWSPs too. We
might have to do multiple block joins for non-root level zwsp pairs.

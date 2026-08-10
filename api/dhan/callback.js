export default async function handler(req, res) {
  const { tokenId } = req.query;

  if (!tokenId) {
    return res.status(400).json({
      success: false,
      message: "No tokenId received from Dhan"
    });
  }

  return res.status(200).json({
    success: true,
    message: "Dhan callback received",
    tokenIdReceived: true
  });
}

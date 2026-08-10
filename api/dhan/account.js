function getCookie(req, name) {
  const cookies = req.headers.cookie || "";

  const match = cookies
    .split(";")
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${name}=`));

  if (!match) {
    return null;
  }

  return decodeURIComponent(
    match.substring(name.length + 1)
  );
}

export default async function handler(req, res) {
  try {
    const accessToken = getCookie(
      req,
      "DHAN_ACCESS_TOKEN"
    );

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: "Dhan session not found. Please authenticate first."
      });
    }

    const response = await fetch(
      "https://api.dhan.co/v2/fundlimit",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "access-token": accessToken
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: "Dhan Fund API request failed",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      message: "Dhan session is active",
      dhanClientId: data.dhanClientId,
      availableBalance: data.availabelBalance,
      utilizedAmount: data.utilizedAmount,
      withdrawableBalance: data.withdrawableBalance
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
